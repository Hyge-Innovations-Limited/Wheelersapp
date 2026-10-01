import { Href, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import {
  isOfferStale,
  RING_WINDOW_MS,
  type MissedOffer,
  type PendingBid,
  type RideOffer,
} from '@/lib/driver-session-reducer';
import { suggestedBidsNgn } from '@/lib/ride-fees';
import { PerKmChip } from '@/components/PerKmChip';
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
import { bidStage, outcomeLabel, tookRidersPrice } from '@/lib/bid-card-state';

function formatNgn(amount: number): string {
  return `₦${Math.round(amount).toLocaleString('en-NG')}`;
}



function countdown(toMs: number, now: number): string | null {
  const remaining = Math.floor((toMs - now) / 1000);
  if (remaining <= 0) return null;
  return `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
}

/**
 * The driver's job feed, inDrive-style: every ride is ONE card for its whole
 * life. A new request shows the rider's price with Accept and three suggested
 * prices right on the card; once answered it lives on the Active tab as the
 * bid card, a rider counter updates that same card, and timeout/decline
 * removes it. The same ride never appears twice.
 *
 * Home is a doorbell: a request sits there for 30 seconds (the ring window),
 * then leaves — it is still open for its whole 30-minute auction on Active,
 * with the time left. Bids never sit on Home; Active is where they live.
 */
const HOME_CARD_WINDOW_MS = RING_WINDOW_MS;
export function DriverRequestFeed({ fullHeight = false }: { fullHeight?: boolean } = {}) {
  const router = useRouter();
  const { session, acceptRide, rejectRide, selectOffer, dismissBid, dismissMissedOffer } = useDriverSession();
  const [filters, setFilters] = useState<DriverFilters>(getDriverFilters());
  useEffect(() => {
    void loadDriverFilters().then(setFilters);
    return subscribeDriverFilters(setFilters);
  }, []);
  const { currentLocation } = useAppLocation();
  const [now, setNow] = useState(() => Date.now());
  const [busyRideId, setBusyRideId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const bids = Object.values(session.pendingBids)
    .filter((bid) => {
      // Home shows a bid only once it is a trip about to start. Every open bid,
      // with its time left, and every grey story lives on the Active tab.
      if (fullHeight) return true;
      return Boolean(bid.acceptedAt);
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
    // Home shows a request for 30 seconds, then it moves on; Active keeps every
    // open one — and the stale ones, greyed, biddable until the ride is taken.
    .filter((offer) => fullHeight || (!isOfferStale(offer, now) && now - (offer.receivedAtMs ?? now) < HOME_CARD_WINDOW_MS))
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
            {entry.reason === 'taken' ? 'Taken by another driver' : 'Expired — not answered'}
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
    const stage = bidStage(bid);
    const accepted = stage === 'accepted';
    const countered = stage === 'countered';
    const paying = stage === 'paying';
    // Declined is still live: red, the rider's current price, and a new bid is one tap.
    const declined = stage === 'declined';
    // Took the rider's own price: not a bid to haggle over — a yes, waiting for them to pay.
    const tookPrice = stage === 'waiting' && tookRidersPrice(bid);
    // Show a ticking clock only while the offer's own auction window is
    // still running. Past it the bid is simply OPEN — waiting on the rider —
    // not a countdown to a fake deadline half an hour away.
    const offerClockMs = new Date(offer.bidsCloseAt ?? offer.expiresAt).getTime();
    const inAuctionTail = Number.isFinite(offerClockMs) && offerClockMs > now;
    const timeLeft = inAuctionTail ? countdown(offerClockMs, now) : null;

    // Declined: the request form again — the rider's current price, Accept, the
    // three prices, Other amount, Skip — glowing red with "Declined" on it.
    if (declined) return renderRequestCard(offer, bid);

    // A resolved bid stays as its story — greyed, dismissible — instead of
    // vanishing mid-thought.
    if (bid.outcome) {
      return (
        <View key={offer.rideId} style={[styles.card, styles.cardResolved]}>
          <View style={styles.topRow}>
            <AppText variant="label" color={theme.colors.muted}>
              {outcomeLabel(bid.outcome)}
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
          accepted ? styles.cardAccepted : countered ? styles.cardCountered : paying ? styles.cardPaying : styles.cardBid,
          pressed && styles.pressed,
        ]}>
        <View style={styles.topRow}>
          <AppText variant="h3" color={accepted ? theme.colors.green : paying ? theme.colors.warning : theme.colors.black}>
            {accepted
              ? bid.riderPaid ? 'Rider paid' : 'Accepted'
              : paying
                ? 'Rider is paying…'
                : countered
                  ? `Rider offers ${formatNgn(riderAsk)}`
                  : tookPrice
                    ? `You took ${formatNgn(bid.amountNgn)}`
                    : `You offered ${formatNgn(bid.amountNgn)}`}
          </AppText>
          {tookPrice ? (
            <AppText variant="caption" color={theme.colors.muted}>the rider's price</AppText>
          ) : !accepted && !paying && timeLeft ? (
            <AppText variant="label" color={theme.colors.black}>{timeLeft} left</AppText>
          ) : !accepted && !paying && !bid.outcome ? (
            <AppText variant="caption" color={theme.colors.muted}>open · waiting on rider</AppText>
          ) : null}
        </View>
        <AppText variant="bodySmall" color={theme.colors.muted} numberOfLines={1}>
          {offer.pickup.address} → {offer.destination.address}
        </AppText>

        {accepted ? (
          <AppText variant="bodySmall" color={theme.colors.muted}>Starting your trip…</AppText>
        ) : paying ? (
          <AppText variant="bodySmall" color={theme.colors.muted}>
            They chose you for {formatNgn(bid.amountNgn)} and are adding money. Keep this trip in mind.
          </AppText>
        ) : countered ? (
          <View style={styles.actionsBlock}>
            <Pressable
              disabled={busyRideId === offer.rideId}
              onPress={() => void sendBid(offer, riderAsk)}
              style={({ pressed }) => [styles.acceptBtn, pressed && styles.pressed]}>
              <AppText variant="h3" color={theme.colors.white}>Accept {formatNgn(riderAsk)}</AppText>
            </Pressable>
            <View style={styles.priceRow}>
              {suggestedBidsNgn(riderAsk).map((amount) => (
                <Pressable
                  key={amount}
                  disabled={busyRideId === offer.rideId}
                  onPress={() => void sendBid(offer, amount)}
                  style={({ pressed }) => [styles.priceChip, pressed && styles.pressed]}>
                  <AppText variant="h3" adjustsFontSizeToFit minimumFontScale={0.75} numberOfLines={1}>
                    {formatNgn(amount)}
                  </AppText>
                </Pressable>
              ))}
            </View>
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
                {tookPrice
                  ? 'Waiting for the rider to confirm and pay. Keep the app open — you can take other requests too.'
                  : 'You can keep taking other requests'}
              </AppText>
            )}
            {/* Took the rider's own price: nothing to change, so no "Change bid". */}
            {tookRidersPrice(bid) ? null : (
              <Pressable
                onPress={() => router.push(`/driver/pending-bid?rideId=${encodeURIComponent(offer.rideId)}` as Href)}
                style={({ pressed }) => [styles.chip, pressed && styles.pressed]}>
                <AppText variant="label">Change bid</AppText>
              </Pressable>
            )}
          </View>
        )}
      </Pressable>
    );
  }

  // ── One life-cycle card: the fresh request state ────────────────────────
  /**
   * A request, as a form: Accept at the rider's price, three prices, Other
   * amount, Skip. `declinedBid`: the rider declined this driver's offer and the
   * trip is still open — the same form, red, saying so; any tap is a new bid.
   */
  function renderRequestCard(offer: RideOffer, declinedBid?: PendingBid) {
    const riderAsk = offer.riderOfferNgn ?? offer.fareEstimateNgn;
    const wasDeclined = Boolean(declinedBid);
    const otherAmount = () => wasDeclined
      ? router.push(`/driver/pending-bid?rideId=${encodeURIComponent(offer.rideId)}` as Href)
      : openDetails(offer.rideId);
    const km = distanceKm(offer);
    const expiresMs = new Date(offer.expiresAt).getTime();
    const stale = !wasDeclined && isOfferStale(offer, now);
    const timeLeft = !stale && Number.isFinite(expiresMs) ? countdown(expiresMs, now) : null;

    return (
      <View
        key={offer.rideId}
        style={[styles.card, wasDeclined ? styles.cardDeclined : stale ? styles.cardStale : styles.cardRequest]}>
        <Pressable onPress={otherAmount}>
          {declinedBid ? (
            <View style={styles.declinedBadgeRow}>
              <View style={styles.declinedBadge}>
                <AppText variant="label" color={theme.colors.white}>DECLINED</AppText>
              </View>
              <AppText variant="caption" color={theme.colors.danger} numberOfLines={1} style={styles.personText}>
                Your {formatNgn(declinedBid.amountNgn)} · send a new offer
              </AppText>
            </View>
          ) : null}
          <View style={styles.topRow}>
            <View>
              <AppText variant="h2" color={wasDeclined ? theme.colors.danger : stale ? theme.colors.muted : theme.colors.orange}>
                {formatNgn(riderAsk)}
              </AppText>
              {/* What this price is worth per km to the driver — their share after
                  the booking fee, over the trip — moving with the rider's price. */}
              <PerKmChip priceNgn={riderAsk} distanceKm={offer.plannedDistanceKm} bookingFeeNgn={offer.bookingFeeNgn} />
            </View>
            <View style={styles.metaRight}>
              {stale ? (
                <AppText variant="caption" color={theme.colors.muted}>
                  window ended · open until taken
                </AppText>
              ) : null}
              {fullHeight && timeLeft ? <AppText variant="label" color={theme.colors.black}>{timeLeft} left</AppText> : null}
              <AppText variant="bodySmall" color={theme.colors.muted}>
                {km === null ? '' : `${km < 10 ? km.toFixed(1) : Math.round(km)} km away`}
                {offer.plannedDistanceKm ? ` · ${offer.plannedDistanceKm.toFixed(1)} km` : ''}
                {offer.plannedDurationSeconds ? ` · ~${Math.max(1, Math.round(offer.plannedDurationSeconds / 60))} min trip` : ''}
              </AppText>
            </View>
          </View>
          <View style={styles.personRow}>
            <AppText variant="bodySmall" color={theme.colors.muted} numberOfLines={1} style={styles.personText}>
              {offer.riderName ?? 'Rider'}
              {offer.riderRating !== undefined ? ` · ${offer.riderRating.toFixed(1)} rating` : ''}
              {offer.riderTripCount !== undefined
                ? ` · ${offer.riderTripCount} ride${offer.riderTripCount === 1 ? '' : 's'}`
                : ''}
            </AppText>
            <AppText variant="caption" color={theme.colors.muted}>
              {offer.paymentMethod === 'CASH' ? 'cash' : 'wallet'}
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
        ) : (
          // Accept at the rider's price, or one of three suggested prices — one tap either way.
          // Three rows, so nothing runs off the card: Accept on its own, the three prices
          // side by side at equal width, then the quiet ways out.
          <View style={styles.actionsBlock}>
            <Pressable
              disabled={busyRideId === offer.rideId}
              onPress={() => void sendBid(offer, riderAsk)}
              style={({ pressed }) => [styles.acceptBtn, pressed && styles.pressed]}>
              <AppText variant="h3" color={theme.colors.white}>
                Accept {formatNgn(riderAsk)}
              </AppText>
            </Pressable>
            <View style={styles.priceRow}>
              {suggestedBidsNgn(riderAsk).map((amount) => (
                <Pressable
                  key={amount}
                  disabled={busyRideId === offer.rideId}
                  onPress={() => void sendBid(offer, amount)}
                  style={({ pressed }) => [styles.priceChip, pressed && styles.pressed]}>
                  <AppText variant="h3" adjustsFontSizeToFit minimumFontScale={0.75} numberOfLines={1}>
                    {formatNgn(amount)}
                  </AppText>
                </Pressable>
              ))}
            </View>
            <View style={styles.quietRow}>
              <Pressable onPress={otherAmount} style={({ pressed }) => [styles.quietBtn, pressed && styles.pressed]}>
                <AppText variant="label" color={theme.colors.muted}>Other amount</AppText>
              </Pressable>
              <Pressable
                onPress={() => {
                  void stopRideRequestSound();
                  // Declined: Skip just clears the card; there is no request to turn down.
                  if (wasDeclined) dismissBid(offer.rideId);
                  else void rejectRide(offer.rideId).catch(() => undefined);
                }}
                style={({ pressed }) => [styles.quietBtn, pressed && styles.pressed]}>
                <AppText variant="label" color={theme.colors.muted}>Skip</AppText>
              </Pressable>
            </View>
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
  // White while waiting; green accepted; yellow paying; red declined.
  cardBid: {
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.white,
  },
  cardPaying: {
    borderColor: theme.colors.warning,
    backgroundColor: '#FFF8E6',
  },
  // Glows red: the rider said no to this price, the trip is still there.
  cardDeclined: {
    borderColor: theme.colors.danger,
    backgroundColor: theme.colors.dangerLight,
    shadowColor: theme.colors.danger,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 10,
    elevation: 8,
  },
  declinedBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: 6,
  },
  declinedBadge: {
    backgroundColor: theme.colors.danger,
    borderRadius: theme.radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  cardCountered: {
    borderColor: theme.colors.orange,
    backgroundColor: theme.colors.orangeLight,
  },
  cardAccepted: {
    borderColor: theme.colors.green,
    backgroundColor: theme.colors.successLight,
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
  actionsBlock: {
    gap: theme.spacing.sm,
    marginTop: 4,
  },
  // The three suggested prices share the width equally; the number is the whole chip.
  priceRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  priceChip: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: theme.spacing.xs,
    borderRadius: theme.radii.sm,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.white,
  },
  quietRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  quietBtn: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xs,
  },
  acceptBtn: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
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
