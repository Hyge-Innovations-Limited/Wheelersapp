import { Href, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppScreen } from '@/components/app-screen';
import { AppText } from '@/components/app-text';
import { BID_LIFETIME_MS } from '@/lib/driver-session-reducer';
import { useDriverSession } from '@/lib/driver-session';
import { useAppLocation } from '@/lib/location';
import { bidNudgesNgn } from '@/lib/ride-fees';
import { theme } from '@/theme';


/** How often to ask the backend about a bid the rider has accepted but whose
 *  trip hasn't materialised on this phone yet. */
const ACCEPTED_SYNC_INTERVAL_MS = 5_000;

function formatNgn(amount: number): string {
  return `₦${Math.round(amount).toLocaleString('en-NG')}`;
}

function formatSince(iso: string, now: number): string {
  const ms = now - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'just now';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hr${hours === 1 ? '' : 's'} ago`;
}

function tripScreenFor(status: string): Href | null {
  switch (status) {
    case 'navigating':
      return '/driver/navigation' as Href;
    case 'arrived':
      return '/driver/arrived' as Href;
    case 'active':
      return '/driver/active-trip' as Href;
    default:
      return null;
  }
}

/**
 * One bid the driver has sent, on its own page: the trip, the number, and
 * where the rider is with it. Before this the bid was a one-line card on the
 * map that couldn't be tapped, so once the rider paid there was nothing to
 * press and nowhere to go.
 */
export default function PendingBidScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ rideId?: string | string[] }>();
  const rideId = Array.isArray(params.rideId) ? params.rideId[0] : params.rideId;
  const { session, acceptRide, syncActiveRide } = useDriverSession();
  const { currentLocation } = useAppLocation();

  const bid = rideId ? session.pendingBids[rideId] : undefined;
  const currentRide = session.currentRide;
  const tripScreen = tripScreenFor(session.status);
  const tripIsThisRide = Boolean(currentRide && rideId && currentRide.rideId === rideId);

  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState<'refresh' | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editAmount, setEditAmount] = useState('');
  const [sendingBid, setSendingBid] = useState(false);
  const routedRef = useRef(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // The moment this bid becomes a trip, hand over to the trip screens.
  useEffect(() => {
    if (!tripIsThisRide || !tripScreen || routedRef.current) return;
    routedRef.current = true;
    router.replace(tripScreen);
  }, [tripIsThisRide, tripScreen, router]);

  // The bid is gone and it did not become our trip: the rider cancelled,
  // picked someone else, or the request timed out. Nothing to show.
  useEffect(() => {
    if (bid || tripIsThisRide) return;
    if (router.canGoBack()) router.back();
    else router.replace('/driver/(tabs)/home' as Href);
  }, [bid, tripIsThisRide, router]);

  // A stale card is the whole reason this page exists: the socket can miss the
  // match while the app is backgrounded. Ask the backend once on open, and
  // keep asking while the rider has accepted but the trip hasn't arrived.
  const accepted = Boolean(bid?.acceptedAt);
  useEffect(() => {
    if (!bid) return;
    void syncActiveRide();
    if (!accepted) return;
    const timer = setInterval(() => {
      void syncActiveRide();
    }, ACCEPTED_SYNC_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [bid, accepted, syncActiveRide]);

  if (!bid) return null;

  const { offer } = bid;
  const fare = bid.agreedFareNgn ?? bid.amountNgn;
  const riderOffer = offer.riderOfferNgn ?? offer.fareEstimateNgn;

  const sendNewBid = async (amountNgn: number) => {
    if (!bid || sendingBid) return;
    if (!Number.isFinite(amountNgn) || amountNgn <= 0) {
      Alert.alert('Enter a valid amount', 'Type the fare you want to offer, e.g. 4500.');
      return;
    }
    setSendingBid(true);
    try {
      await acceptRide(bid.offer.rideId, Math.round(amountNgn), currentLocation ?? undefined);
      setEditOpen(false);
      setEditAmount('');
    } catch (err) {
      Alert.alert('Could not update bid', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSendingBid(false);
    }
  };

  const handleRefresh = async () => {
    setBusy('refresh');
    try {
      const found = await syncActiveRide();
      if (!found) {
        Alert.alert(
          'Not started yet',
          'The rider has accepted, but the trip has not been set up on our side yet. Give it a moment and try again.',
        );
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <AppScreen scroll safeAreaEdges={['top', 'bottom']}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <AppText variant="h2">Your bid</AppText>
        <AppText variant="bodySmall" color={theme.colors.muted}>
          Sent {formatSince(bid.sentAt, now)}
        </AppText>
      </View>

      {/* Status — the one line the driver opened this page for. */}
      <View style={[styles.statusCard, accepted ? styles.statusAccepted : styles.statusWaiting]}>
        <AppText variant="h3" color={accepted ? theme.colors.orange : theme.colors.green}>
          {accepted
            ? bid.riderPaid
              ? 'Rider accepted and paid'
              : 'Rider accepted your bid'
            : `Your bid: ${formatNgn(bid.amountNgn)}`}
        </AppText>
        <AppText variant="bodySmall" color={theme.colors.muted}>
          {accepted
            ? tripIsThisRide
              ? 'Your trip is ready.'
              : 'Setting up your trip. This usually takes a few seconds.'
            : 'Waiting for the rider. You can leave this page; we will alert you when they decide.'}
        </AppText>
        {!accepted ? (() => {
          // The server's clock for this search, the same one the request card counted down.
          // Counting from the driver's own bid time overstated it by however long they took to bid.
          const serverCloseMs = new Date(offer.bidsCloseAt ?? offer.expiresAt).getTime();
          const closesMs = Number.isFinite(serverCloseMs)
            ? serverCloseMs
            : new Date(bid.counteredAt ?? bid.sentAt).getTime() + BID_LIFETIME_MS - 30_000;
          const left = Math.max(0, Math.floor((closesMs - now) / 1000));
          if (left === 0) {
            return (
              <AppText variant="label" color={theme.colors.muted} style={styles.countdown}>
                The search window has ended. Your bid stays open until the rider decides.
              </AppText>
            );
          }
          return (
            <AppText variant="monoLarge" color={left < 30 ? theme.colors.danger : theme.colors.black} style={styles.countdown}>
              {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')} until this search ends
            </AppText>
          );
        })() : null}
      </View>

      {/* The trip */}
      <View style={styles.card}>
        <AppText variant="label" color={theme.colors.muted} style={styles.cardTitle}>
          Trip
        </AppText>
        <View style={styles.stopRow}>
          <View style={[styles.stopDot, { backgroundColor: theme.colors.green }]} />
          <View style={styles.stopText}>
            <AppText variant="caption" color={theme.colors.muted}>Pickup</AppText>
            <AppText variant="body">{offer.pickup.address}</AppText>
          </View>
        </View>
        {offer.stops.map((stop, index) => (
          <View key={`${stop.lat},${stop.lng},${index}`} style={styles.stopRow}>
            <View style={[styles.stopDot, { backgroundColor: theme.colors.mutedLight }]} />
            <View style={styles.stopText}>
              <AppText variant="caption" color={theme.colors.muted}>Stop {index + 1}</AppText>
              <AppText variant="body">{stop.address}</AppText>
            </View>
          </View>
        ))}
        <View style={styles.stopRow}>
          <View style={[styles.stopDot, { backgroundColor: theme.colors.orange }]} />
          <View style={styles.stopText}>
            <AppText variant="caption" color={theme.colors.muted}>Destination</AppText>
            <AppText variant="body">{offer.destination.address}</AppText>
          </View>
        </View>
        <AppText variant="monoSmall" color={theme.colors.mutedLight} style={styles.tripMeta}>
          {offer.plannedDistanceKm ? `${offer.plannedDistanceKm.toFixed(1)} km` : 'distance unknown'}
          {offer.plannedDurationSeconds
            ? ` · ~${Math.max(1, Math.round(offer.plannedDurationSeconds / 60))} min`
            : ''}
          {offer.isGroupRide ? ` · group · ${offer.riderCount ?? 2} riders` : ''}
        </AppText>
      </View>

      {/* The money */}
      <View style={styles.card}>
        <AppText variant="label" color={theme.colors.muted} style={styles.cardTitle}>
          Fare
        </AppText>
        <View style={styles.lineRow}>
          <AppText variant="bodySmall" color={theme.colors.muted}>Rider offered</AppText>
          <AppText variant="bodySmall">{formatNgn(riderOffer)}</AppText>
        </View>
        <View style={styles.lineRow}>
          <AppText variant="body">{accepted ? 'Agreed fare' : 'Your bid'}</AppText>
          <AppText variant="h3" color={theme.colors.orange}>{formatNgn(fare)}</AppText>
        </View>
      </View>

      {/* Change the bid — a bid is a negotiation, not a commitment. */}
      {!accepted ? (
        <View style={styles.card}>
          <AppText variant="label" color={theme.colors.muted} style={styles.cardTitle}>
            Change your bid
          </AppText>
          {riderOffer !== bid.amountNgn ? (
            <AppButton
              title={`Accept rider's ${formatNgn(riderOffer)}`}
              onPress={() => void sendNewBid(riderOffer)}
              loading={sendingBid}
            />
          ) : null}
          {editOpen ? (
            <>
              <View style={styles.editRow}>
                <AppText variant="h3">₦</AppText>
                <TextInput
                  style={styles.editInput}
                  keyboardType="number-pad"
                  autoFocus
                  value={editAmount}
                  onChangeText={(text) => setEditAmount(text.replace(/[^0-9]/g, ''))}
                  placeholder={String(bid.amountNgn)}
                  placeholderTextColor={theme.colors.mutedLight}
                />
              </View>
              <View style={styles.chipRow}>
                {bidNudgesNgn(Number(editAmount) || bid.amountNgn).map((step) => (
                  <Pressable
                    key={step}
                    onPress={() => setEditAmount(String(Math.max(0, (Number(editAmount) || bid.amountNgn) + step)))}
                    style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}>
                    <AppText variant="label">{step > 0 ? `+${step.toLocaleString()}` : `-${Math.abs(step).toLocaleString()}`}</AppText>
                  </Pressable>
                ))}
              </View>
              <AppButton
                title={`Send new bid${editAmount ? ` · ${formatNgn(Number(editAmount))}` : ''}`}
                onPress={() => void sendNewBid(Number(editAmount))}
                loading={sendingBid}
              />
            </>
          ) : (
            <AppButton
              title="New amount…"
              variant="ghost"
              onPress={() => {
                setEditAmount(String(bid.amountNgn));
                setEditOpen(true);
              }}
            />
          )}
        </View>
      ) : null}

      <View style={styles.actions}>
        {accepted ? (
          tripIsThisRide && tripScreen ? (
            <AppButton title="Open trip" onPress={() => router.replace(tripScreen)} />
          ) : (
            <AppButton
              title="Refresh"
              onPress={handleRefresh}
              loading={busy === 'refresh'}
            />
          )
        ) : null}
        <AppButton
          title={accepted ? 'Back' : 'Close — keep my bid'}
          variant="ghost"
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/driver/(tabs)/home' as Href);
          }}
        />
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.lg,
  },
  // The clock is the one number on this page that changes; it reads at a glance.
  countdown: {
    marginTop: 4,
  },
  statusCard: {
    gap: theme.spacing.xs,
    padding: theme.spacing.lg,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.thick,
    backgroundColor: theme.colors.white,
    marginBottom: theme.spacing.md,
  },
  statusWaiting: {
    borderColor: theme.colors.green,
  },
  statusAccepted: {
    borderColor: theme.colors.orange,
    backgroundColor: theme.colors.orangeLight,
  },
  card: {
    gap: theme.spacing.sm,
    padding: theme.spacing.lg,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.white,
    marginBottom: theme.spacing.md,
  },
  cardTitle: {
    marginBottom: theme.spacing.xs,
  },
  stopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
  },
  stopDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 6,
  },
  stopText: {
    flex: 1,
    gap: 2,
  },
  tripMeta: {
    marginTop: theme.spacing.xs,
  },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.borderLight,
    marginVertical: theme.spacing.xs,
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    borderRadius: theme.radii.sm,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.white,
  },
  editInput: {
    flex: 1,
    fontFamily: 'ClashDisplay_700Bold',
    fontSize: 22,
    color: theme.colors.black,
    minHeight: 52,
    paddingVertical: 0,
  },
  chipRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  chip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    borderRadius: theme.radii.sm,
    borderWidth: 1.5,
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.white,
  },
  chipPressed: {
    opacity: 0.6,
  },
  actions: {
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
});
