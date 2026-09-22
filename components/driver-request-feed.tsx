import { Href, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import {
  bidDeadlineMs,
  isOfferStale,
  type MissedOffer,
  type PendingBid,
  type RideOffer,
} from '@/lib/driver-session-reducer';
import { useDriverSession } from '@/lib/driver-session';
import {
  getDriverFilters,
  loadDriverFilters,
  subscribeDriverFilters,
  type DriverFilters,
} from '@/lib/driver-filters';
import { haversineKm } from '@/lib/geo';
import { useAppLocation } from '@/lib/location';
import { stopRideRequestSound } from '@/lib/sounds';
import { theme } from '@/theme';

function formatNgn(amount: number): string {
  return `₦${Math.round(amount).toLocaleString('en-NG')}`;
}

function countdown(toMs: number, now: number): string | null {
  const remaining = Math.floor((toMs - now) / 1000);
  if (remaining <= 0) return null;
  return `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
}

const BID_INCREMENTS = [100, 200, 500];

/**
 * The driver's job feed, inDrive-style: every ride is ONE card for its whole
 * life. A new request shows the rider's price with Accept / bid chips right
 * on the card; once answered it becomes the bid card ("waiting ⏳"), a rider
 * counter updates that same card, and timeout/decline removes it. The same
 * ride never appears twice, and nothing on screen outlives its auction.
 */
export function DriverRequestFeed({ fullHeight = false }: { fullHeight?: boolean } = {}) {
  const router = useRouter();
  const { session, acceptRide, selectOffer, dismissBid, dismissMissedOffer } = useDriverSession();
  const [filters, setFilters] = useState<DriverFilters>(getDriverFilters());
  useEffect(() => {
    void loadDriverFilters().then(setFilters);
    return subscribeDriverFilters(setFilters);
  }, []);
  const { currentLocation } = useAppLocation();
  const [now, setNow] = useState(() => Date.now());
  const [bidOpenFor, setBidOpenFor] = useState<string | null>(null);
  const [busyRideId, setBusyRideId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const bids = Object.values(session.pendingBids)
    .filter((bid) => {
      // Home's overlay carries only the LIVE auction: requests in-window and
      // bids the clock is still running on (or already accepted — a trip is
      // about to start). Everything past its window — 'waiting on rider'
      // holdouts and grey terminal stories — lives on the Active tab only.
      if (fullHeight) return true;
      if (bid.acceptedAt) return true;
      if (bid.outcome) return false;
      const clockMs = new Date(bid.offer.bidsCloseAt ?? bid.offer.expiresAt).getTime();
      return !Number.isFinite(clockMs) || clockMs > now;
    })
    .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
  const answered = new Set(bids.map((bid) => bid.offer.rideId));
  const requests = session.offers
    .filter((offer) => !answered.has(offer.rideId))
    .filter((offer) => {
      // The driver's own bar for what's worth a look.
      const ask = offer.riderOfferNgn ?? offer.fareEstimateNgn;
      if (filters.minFareNgn !== null && ask < filters.minFareNgn) return false;
      if (filters.maxPickupKm !== null) {
        const km = distanceKm(offer);
        if (km !== null && km > filters.maxPickupKm) return false;
      }
      return true;
    })
    // Home's overlay shows only fresh requests; Active also keeps the stale
    // ones — past their window, greyed, but biddable until the ride is taken.
    .filter((offer) => fullHeight || !isOfferStale(offer, now))
    .sort((a, b) => {
      const staleDiff = Number(isOfferStale(a, now)) - Number(isOfferStale(b, now));
      if (staleDiff !== 0) return staleDiff;
      return (distanceKm(a) ?? 99) - (distanceKm(b) ?? 99);
    });

  function distanceKm(offer: RideOffer): number | null {
    if (!currentLocation) return null;
    return haversineKm(currentLocation.lat, currentLocation.lng, offer.pickup.lat, offer.pickup.lng);
  }

  async function sendBid(offer: RideOffer, amountNgn: number) {
    if (busyRideId) return;
    setBusyRideId(offer.rideId);
    try {
      void stopRideRequestSound();
      await acceptRide(offer.rideId, amountNgn, currentLocation ?? undefined);
      setBidOpenFor(null);
    } catch (err) {
      Alert.alert('Could not send bid', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setBusyRideId(null);
    }
  }

  function openDetails(rideId: string) {
    void stopRideRequestSound();
    selectOffer(rideId);
    router.push('/driver/incoming-request' as Href);
  }

  const missed = fullHeight ? session.missedOffers : [];

  if (bids.length === 0 && requests.length === 0 && missed.length === 0) return null;

  return (
    <ScrollView
      style={fullHeight ? styles.scrollFull : styles.scroll}
      showsVerticalScrollIndicator={false}>
      {bids.map((bid) => renderBidCard(bid))}
      {requests.map((offer) => renderRequestCard(offer))}
      {missed.map((entry) => renderMissedCard(entry))}
    </ScrollView>
  );

  // ── A request that ran out unanswered: greyed, dismissible — and still
  // tappable. Opening it revives the request so the driver can bid anyway.
  function renderMissedCard(entry: MissedOffer) {
    const { offer } = entry;
    const ask = offer.riderOfferNgn ?? offer.fareEstimateNgn;
    return (
      <Pressable
        key={`missed-${offer.rideId}`}
        disabled={entry.reason === 'taken'}
        onPress={() => openDetails(offer.rideId)}
        style={({ pressed }) => [styles.card, styles.cardResolved, pressed && styles.pressed]}>
        <View style={styles.topRow}>
          <AppText variant="label" color={theme.colors.muted}>
            {entry.reason === 'taken' ? 'Taken by another driver' : 'Expired — not answered ⏱'}
          </AppText>
          <Pressable onPress={() => dismissMissedOffer(offer.rideId)} style={styles.cancelChip}>
            <AppText variant="label" color={theme.colors.muted}>✕</AppText>
          </Pressable>
        </View>
        <AppText variant="bodySmall" color={theme.colors.mutedLight} numberOfLines={1}>
          {offer.pickup.address} → {offer.destination.address} · {formatNgn(ask)}
        </AppText>
        <AppText variant="caption" color={theme.colors.muted}>
          {entry.reason === 'taken'
            ? 'Another driver has this one'
            : 'Tap to view — you can still try a bid'}
        </AppText>
      </Pressable>
    );
  }

  // ── One life-cycle card: the bid states ─────────────────────────────────
  function renderBidCard(bid: PendingBid) {
    const { offer } = bid;
    const riderAsk = offer.riderOfferNgn ?? offer.fareEstimateNgn;
    const accepted = Boolean(bid.acceptedAt);
    const countered = Boolean(bid.counteredAt) && riderAsk !== bid.amountNgn;
    // Show a ticking clock only while the offer's own auction window is
    // still running. Past it the bid is simply OPEN — waiting on the rider —
    // not a countdown to a fake deadline half an hour away.
    const offerClockMs = new Date(offer.bidsCloseAt ?? offer.expiresAt).getTime();
    const inAuctionTail = Number.isFinite(offerClockMs) && offerClockMs > now;
    const timeLeft = inAuctionTail ? countdown(offerClockMs, now) : null;

    // A resolved bid stays as its story — greyed, dismissible — instead of
    // vanishing mid-thought.
    if (bid.outcome) {
      return (
        <View key={offer.rideId} style={[styles.card, styles.cardResolved]}>
          <View style={styles.topRow}>
            <AppText variant="label" color={theme.colors.muted}>
              {bid.outcome === 'lost'
                ? 'Rider chose another driver'
                : bid.outcome === 'withdrawn'
                  ? 'Your offer was withdrawn'
                  : 'Request ended ⏱'}
            </AppText>
            <Pressable onPress={() => dismissBid(offer.rideId)} style={styles.cancelChip}>
              <AppText variant="label" color={theme.colors.muted}>✕</AppText>
            </Pressable>
          </View>
          <AppText variant="bodySmall" color={theme.colors.mutedLight} numberOfLines={1}>
            {offer.pickup.address} → {offer.destination.address} · your bid {formatNgn(bid.amountNgn)}
          </AppText>
        </View>
      );
    }

    return (
      <Pressable
        key={offer.rideId}
        onPress={() => router.push(`/driver/pending-bid?rideId=${encodeURIComponent(offer.rideId)}` as Href)}
        style={({ pressed }) => [
          styles.card,
          accepted ? styles.cardAccepted : countered ? styles.cardCountered : styles.cardBid,
          pressed && styles.pressed,
        ]}>
        <View style={styles.topRow}>
          <AppText variant="h3" color={accepted ? theme.colors.orange : theme.colors.green}>
            {accepted
              ? bid.riderPaid ? '✅ Rider paid' : '✅ Accepted'
              : countered
                ? `Rider offers ${formatNgn(riderAsk)}`
                : `You offered ${formatNgn(bid.amountNgn)}`}
          </AppText>
          {!accepted && timeLeft ? (
            <AppText variant="mono" color={theme.colors.muted}>⏳ {timeLeft}</AppText>
          ) : !accepted && !bid.outcome ? (
            <AppText variant="caption" color={theme.colors.muted}>open · waiting on rider</AppText>
          ) : null}
        </View>
        <AppText variant="bodySmall" color={theme.colors.muted} numberOfLines={1}>
          {offer.pickup.address} → {offer.destination.address}
        </AppText>

        {accepted ? (
          <AppText variant="bodySmall" color={theme.colors.muted}>Starting your trip…</AppText>
        ) : countered ? (
          <View style={styles.actionsRow}>
            <Pressable
              disabled={busyRideId === offer.rideId}
              onPress={() => void sendBid(offer, riderAsk)}
              style={({ pressed }) => [styles.acceptBtn, pressed && styles.pressed]}>
              <AppText variant="label" color={theme.colors.white}>Accept {formatNgn(riderAsk)}</AppText>
            </Pressable>
            {BID_INCREMENTS.slice(0, 2).map((step) => (
              <Pressable
                key={step}
                disabled={busyRideId === offer.rideId}
                onPress={() => void sendBid(offer, riderAsk + step)}
                style={({ pressed }) => [styles.chip, pressed && styles.pressed]}>
                <AppText variant="label">+{step}</AppText>
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={styles.actionsRow}>
            {riderAsk !== bid.amountNgn ? (
              <Pressable
                disabled={busyRideId === offer.rideId}
                onPress={() => void sendBid(offer, riderAsk)}
                style={({ pressed }) => [styles.acceptBtn, pressed && styles.pressed]}>
                <AppText variant="label" color={theme.colors.white}>Accept {formatNgn(riderAsk)}</AppText>
              </Pressable>
            ) : (
              <AppText variant="caption" color={theme.colors.mutedLight} style={styles.waitNote}>
                You can keep taking other requests
              </AppText>
            )}
            <Pressable
              onPress={() => router.push(`/driver/pending-bid?rideId=${encodeURIComponent(offer.rideId)}` as Href)}
              style={({ pressed }) => [styles.chip, pressed && styles.pressed]}>
              <AppText variant="label">Change bid</AppText>
            </Pressable>
          </View>
        )}
      </Pressable>
    );
  }

  // ── One life-cycle card: the fresh request state ────────────────────────
  function renderRequestCard(offer: RideOffer) {
    const riderAsk = offer.riderOfferNgn ?? offer.fareEstimateNgn;
    const km = distanceKm(offer);
    const expiresMs = new Date(offer.expiresAt).getTime();
    const stale = isOfferStale(offer, now);
    const timeLeft = !stale && Number.isFinite(expiresMs) ? countdown(expiresMs, now) : null;
    const bidOpen = bidOpenFor === offer.rideId;

    return (
      <View
        key={offer.rideId}
        style={[styles.card, stale ? styles.cardStale : styles.cardRequest]}>
        <Pressable onPress={() => openDetails(offer.rideId)}>
          <View style={styles.topRow}>
            <AppText variant="h2" color={stale ? theme.colors.muted : theme.colors.orange}>
              {formatNgn(riderAsk)}
            </AppText>
            <View style={styles.metaRight}>
              {stale ? (
                <AppText variant="caption" color={theme.colors.muted}>
                  window ended · open until taken
                </AppText>
              ) : null}
              {timeLeft ? <AppText variant="mono" color={theme.colors.muted}>⏳ {timeLeft}</AppText> : null}
              <AppText variant="bodySmall" color={theme.colors.muted}>
                {km === null ? '' : `${km < 10 ? km.toFixed(1) : Math.round(km)} km away`}
                {offer.plannedDistanceKm ? ` · ${offer.plannedDistanceKm.toFixed(1)} km trip` : ''}
              </AppText>
            </View>
          </View>
          <View style={styles.personRow}>
            <AppText variant="bodySmall" color={theme.colors.muted} numberOfLines={1} style={styles.personText}>
              {offer.riderName ?? 'Rider'}
              {offer.riderRating !== undefined ? ` ⭐${offer.riderRating.toFixed(1)}` : ''}
              {offer.riderTripCount !== undefined
                ? ` · ${offer.riderTripCount} ride${offer.riderTripCount === 1 ? '' : 's'}`
                : ''}
            </AppText>
            <AppText variant="caption" color={theme.colors.muted}>
              {offer.paymentMethod === 'CASH' ? '💵 cash' : '💰 wallet'}
            </AppText>
          </View>
          {offer.afterCurrentTrip ? (
            <AppText variant="caption" color={theme.colors.orange} style={styles.queuedTag}>
              NEXT RIDE · PICKS UP NEAR YOUR DROP-OFF
            </AppText>
          ) : null}
          <AppText variant="body" numberOfLines={1}>{offer.pickup.address}</AppText>
          <AppText variant="bodySmall" color={theme.colors.muted} numberOfLines={1}>
            → {offer.destination.address}
            {offer.isGroupRide ? `  · group · ${offer.riderCount ?? 2} riders` : ''}
          </AppText>
        </Pressable>

        {/* Group rides negotiate per seat — that lives on the details screen. */}
        {offer.isGroupRide ? (
          <View style={styles.actionsRow}>
            <Pressable
              onPress={() => openDetails(offer.rideId)}
              style={({ pressed }) => [styles.acceptBtn, pressed && styles.pressed]}>
              <AppText variant="label" color={theme.colors.white}>View seats</AppText>
            </Pressable>
          </View>
        ) : bidOpen ? (
          <View style={styles.actionsRow}>
            {BID_INCREMENTS.map((step) => (
              <Pressable
                key={step}
                disabled={busyRideId === offer.rideId}
                onPress={() => void sendBid(offer, riderAsk + step)}
                style={({ pressed }) => [styles.chip, pressed && styles.pressed]}>
                <AppText variant="label">+{step}</AppText>
              </Pressable>
            ))}
            <Pressable
              onPress={() => openDetails(offer.rideId)}
              style={({ pressed }) => [styles.chip, pressed && styles.pressed]}>
              <AppText variant="label" color={theme.colors.muted}>Custom…</AppText>
            </Pressable>
            <Pressable onPress={() => setBidOpenFor(null)} style={styles.cancelChip}>
              <AppText variant="label" color={theme.colors.muted}>✕</AppText>
            </Pressable>
          </View>
        ) : (
          <View style={styles.actionsRow}>
            <Pressable
              disabled={busyRideId === offer.rideId}
              onPress={() => void sendBid(offer, riderAsk)}
              style={({ pressed }) => [styles.acceptBtn, pressed && styles.pressed]}>
              <AppText variant="label" color={theme.colors.white}>
                Accept {formatNgn(riderAsk)}
              </AppText>
            </Pressable>
            <Pressable
              onPress={() => setBidOpenFor(offer.rideId)}
              style={({ pressed }) => [styles.bidBtn, pressed && styles.pressed]}>
              <AppText variant="label">Your price</AppText>
            </Pressable>
          </View>
        )}
      </View>
    );
  }
}

const styles = StyleSheet.create({
  // A request offered mid-trip: the driver must know it is a QUEUE, not a job
  // to abandon their rider for.
  queuedTag: {
    marginTop: 6,
    letterSpacing: 0.4,
  },
  scroll: {
    maxHeight: 380,
  },
  scrollFull: {
    flex: 1,
  },
  card: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.radii.md,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    gap: 6,
    ...theme.shadows.card,
  },
  cardRequest: {
    borderColor: theme.colors.orange,
  },
  cardBid: {
    borderColor: theme.colors.green,
  },
  cardCountered: {
    borderColor: theme.colors.orange,
    backgroundColor: theme.colors.orangeLight,
  },
  cardAccepted: {
    borderColor: theme.colors.orange,
    backgroundColor: theme.colors.orangeLight,
  },
  cardStale: {
    borderColor: theme.colors.mutedLight,
    opacity: 0.75,
  },
  cardResolved: {
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.offWhite,
    opacity: 0.85,
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  personText: {
    flexShrink: 1,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  metaRight: {
    alignItems: 'flex-end',
    gap: 2,
    flexShrink: 1,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginTop: 2,
  },
  acceptBtn: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radii.sm,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.green,
  },
  bidBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radii.sm,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.white,
  },
  chip: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radii.sm,
    borderWidth: 1.5,
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.white,
  },
  cancelChip: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: theme.spacing.sm,
  },
  waitNote: {
    flex: 1,
  },
  pressed: {
    opacity: 0.6,
  },
});
