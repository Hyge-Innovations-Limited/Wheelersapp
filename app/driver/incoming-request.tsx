import { Href, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeIn,
  FadeInDown,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { AppButton } from '@/components/app-button';
import { bidCeilingNgn } from '@/lib/bid-limits';
import { rideFees, suggestedBidsNgn } from '@/lib/ride-fees';
import { AppText } from '@/components/app-text';
import { useKeyboardHeight } from '@/hooks/use-keyboard';
import { useDriverSession, type GroupSeat } from '@/lib/driver-session';
import { estimateEtaMinutes, haversineKm } from '@/lib/geo';
import { useAppLocation } from '@/lib/location';
import { useResponsive } from '@/lib/responsive';
import { stopRideRequestSound } from '@/lib/sounds';
import { theme } from '@/theme';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const DISMISS_THRESHOLD = 120;

// Fees mirror the server: see lib/ride-fees.ts.


function formatNgn(amount: number): string {
  return `₦${Math.round(amount).toLocaleString('en-NG')}`;
}

type RouteStopRow = {
  label: string;
  address: string;
  kind: 'pickup' | 'dropoff';
  /** Seat number shown inside the marker on shared rides. */
  seat?: string;
};

/**
 * Turns an offer into the ordered list of stops the driver will actually make.
 * On a shared ride the waypoints carry their kind, so each one reads as
 * "Pickup 2" / "Drop-off 1" rather than an anonymous coordinate.
 */
function buildRouteStops(params: {
  pickup: string;
  destination: string;
  stops: string[];
  stopKinds?: Array<'pickup' | 'dropoff'>;
  isGroupRide: boolean;
}): RouteStopRow[] {
  const { pickup, destination, stops, stopKinds, isGroupRide } = params;

  if (!isGroupRide) {
    return [
      { label: 'Pickup', address: pickup, kind: 'pickup' },
      ...stops.map((address, i) => ({
        label: `Stop ${i + 1}`,
        address,
        kind: 'dropoff' as const,
      })),
      { label: 'Destination', address: destination, kind: 'dropoff' },
    ];
  }

  let pickups = 1;
  let dropoffs = 0;
  const rows: RouteStopRow[] = [
    { label: 'Pickup 1', address: pickup, kind: 'pickup', seat: '1' },
  ];

  stops.forEach((address, i) => {
    // Fall back to pickup-then-dropoff ordering if kinds are unavailable.
    const kind = stopKinds?.[i] ?? (i < stops.length / 2 ? 'pickup' : 'dropoff');
    const seat = kind === 'pickup' ? ++pickups : ++dropoffs;
    rows.push({
      label: kind === 'pickup' ? `Pickup ${seat}` : `Drop-off ${seat}`,
      address,
      kind,
      seat: String(seat),
    });
  });

  rows.push({
    label: `Drop-off ${dropoffs + 1}`,
    address: destination,
    kind: 'dropoff',
    seat: String(dropoffs + 1),
  });

  return rows;
}

export default function IncomingRequestScreen() {
  const router = useRouter();
  const { session, acceptRide, bidOnSeat, rejectRide, selectOffer } = useDriverSession();
  // Per-seat negotiation state for group rides: which seats we've answered,
  // and which seat's bid input is open.
  const [seatBids, setSeatBids] = useState<Record<string, number>>({});
  const [seatBidMode, setSeatBidMode] = useState<string | null>(null);
  const [seatBidAmount, setSeatBidAmount] = useState('');
  const { currentLocation } = useAppLocation();
  const insets = useSafeAreaInsets();
  const responsive = useResponsive();
  const keyboardHeight = useKeyboardHeight();
  const offer = session.currentOffer;
  // No band on a driver's bid: below the rider's price, at it or above it, the rider
  // decides. The one check is a typo guard, ten times the rider's price.
  const maxBid = bidCeilingNgn(offer?.riderOfferNgn ?? offer?.fareEstimateNgn);
  const [bidMode, setBidMode] = useState(false);
  const [bidAmount, setBidAmount] = useState('');
  const [lastBidNgn, setLastBidNgn] = useState<number | null>(null);
  const [bidSent, setBidSent] = useState(false);
  const bidSentRef = useRef(false);
  useEffect(() => {
    bidSentRef.current = bidSent;
  }, [bidSent]);
  const bidInputRef = useRef<TextInput>(null);
  const sheetScrollRef = useRef<ScrollView>(null);

  // The bid field and submit button live at the bottom of the sheet's scroll
  // content — bring them into view the moment the keyboard is up.
  useEffect(() => {
    if (bidMode && keyboardHeight > 0) {
      const t = setTimeout(() => sheetScrollRef.current?.scrollToEnd({ animated: true }), 80);
      return () => clearTimeout(t);
    }
  }, [bidMode, keyboardHeight]);

  // Swipe-to-dismiss
  const translateY = useSharedValue(0);

  const stopSoundImmediately = () => {
    void stopRideRequestSound();
  };

  const dismiss = () => {
    void handleDismiss();
  };

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      // Only allow downward swipe
      if (e.translationY > 0) {
        translateY.value = e.translationY;
      }
    })
    .onEnd((e) => {
      if (e.translationY > DISMISS_THRESHOLD) {
        runOnJS(stopSoundImmediately)();
        translateY.value = withTiming(SCREEN_HEIGHT, { duration: 250 }, () => {
          runOnJS(dismiss)();
        });
      } else {
        translateY.value = withSpring(0, { damping: 20, stiffness: 200 });
      }
    });

  const cardAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  // When the rider re-bids, the driver's own last bid is stale history. Left in
  // place it kept winning the `lastBidNgn ?? …` fallback below, so the card
  // showed the driver's old number and the rider's new one never appeared.
  const riderOfferNgn = offer?.riderOfferNgn ?? offer?.fareEstimateNgn;
  useEffect(() => {
    setLastBidNgn(null);
    setBidSent(false);
  }, [offer?.rideId, riderOfferNgn]);

  // Seat answers belong to one request — a different ride means fresh seats.
  useEffect(() => {
    setSeatBids({});
    setSeatBidMode(null);
    setSeatBidAmount('');
  }, [offer?.rideId]);


  // The alert rings on the home list now — the driver is looking at the
  // request, so stop it.
  useEffect(() => {
    void stopRideRequestSound();
  }, []);

  // If the request is gone (taken, cancelled, expired), pop back to the list —
  // unless we are transitioning into the trip, where the navigation screen
  // takes over and a back() here would race the replace().
  useEffect(() => {
    if (!offer && session.status !== 'navigating') {
      router.back();
    }
  }, [offer, session.status, router]);

  // Navigate forward when ride is accepted
  useEffect(() => {
    if (session.status === 'navigating') {
      void stopRideRequestSound();
      router.replace('/driver/navigation' as Href);
    }
  }, [session.status, router]);

  const handleAccept = async () => {
    if (!offer || bidSent) return;
    try {
      void stopRideRequestSound();
      await acceptRide(offer.rideId, undefined, currentLocation ?? undefined);
      setBidSent(true);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not accept ride.');
    }
  };

  // Swiping away is non-destructive: the request stays open in the queue.
  // Turning down the job is the explicit Decline button — a hidden gesture
  // must never silently reject work.
  const handleDismiss = async () => {
    if (!offer) return;
    void stopRideRequestSound();
    router.back();
  };

  const handleDecline = async () => {
    if (!offer) return;
    try {
      void stopRideRequestSound();
      await rejectRide(offer.rideId);
    } catch {
      // ignore — leaving the screen is the outcome either way
    }
    router.back();
  };

  const handleAcceptAllSeats = async () => {
    const seats = offer?.groupMembers ?? [];
    for (const seat of seats) {
      if (seatBids[seat.rideId] !== undefined) continue;
      // Sequential on purpose — one failed seat shouldn't mark the rest sent.
      // eslint-disable-next-line no-await-in-loop
      await handleSeatAccept(seat);
    }
  };

  const handleSeatAccept = async (seat: GroupSeat) => {
    try {
      void stopRideRequestSound();
      await bidOnSeat(seat, undefined, currentLocation ?? undefined);
      setSeatBids((prev) => ({ ...prev, [seat.rideId]: seat.offerNgn }));
      // A seat answer is engagement — dismissing must not reject the ride.
      setBidSent(true);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not accept this seat.');
    }
  };

  const handleSeatBid = async (seat: GroupSeat) => {
    const amount = parseInt(seatBidAmount, 10);
    if (!amount || amount < 100) {
      Alert.alert('Invalid amount', 'Enter a valid bid for this seat.');
      return;
    }
    try {
      void stopRideRequestSound();
      Keyboard.dismiss();
      await bidOnSeat(seat, amount, currentLocation ?? undefined);
      setSeatBids((prev) => ({ ...prev, [seat.rideId]: amount }));
      setBidSent(true);
      setSeatBidMode(null);
      setSeatBidAmount('');
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not bid on this seat.');
    }
  };

  const handleBidPress = () => {
    setBidMode(true);
    setBidAmount('');
    requestAnimationFrame(() => bidInputRef.current?.focus());
  };

  const handleSubmitBid = () => handleSubmitBidAt(parseInt(bidAmount, 10));

  const handleSubmitBidAt = async (amount: number) => {
    if (!offer || bidSent) return;
    if (!amount || amount < 100) {
      Alert.alert('Invalid amount', 'Enter a valid bid amount.');
      return;
    }
    if (maxBid !== null && amount > maxBid) {
      Alert.alert(
        'Is that right?',
        `That is more than ten times the rider's price. Check the amount and try again.`,
      );
      return;
    }
    try {
      void stopRideRequestSound();
      Keyboard.dismiss();
      setBidMode(false);
      setLastBidNgn(amount);
      await acceptRide(offer.rideId, amount, currentLocation ?? undefined);
      setBidSent(true);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not submit bid.');
    }
  };

  const handleCancelBid = () => {
    setBidMode(false);
    setBidAmount('');
    Keyboard.dismiss();
  };

  if (!offer) return null;

  // The rider's live number, not the original estimate — a counter-offer only
  // moves riderOfferNgn, so reading fareEstimateNgn froze the price on screen.
  const activeFare = lastBidNgn ?? offer.riderOfferNgn ?? offer.fareEstimateNgn;
  // One number, not the itemised fees: what lands in the driver's wallet at this price.
  const driverPayout = rideFees(activeFare).driverPayoutNgn;
  const distanceKm = offer.plannedDistanceKm
    ? `${offer.plannedDistanceKm.toFixed(1)} km`
    : '--';
  const durationMin = offer.plannedDurationSeconds
    ? `${Math.ceil(offer.plannedDurationSeconds / 60)} min`
    : '--';

  // Live driver→pickup: recomputed from the phone's GPS on every location
  // update (LocationProvider emits every 25 m / 15 s), falling back to the
  // backend's match-time seed when there's no fix yet.
  const pickupKm = currentLocation
    ? haversineKm(currentLocation.lat, currentLocation.lng, offer.pickup.lat, offer.pickup.lng)
    : offer.pickupDistanceKm;
  const toPickupLabel =
    pickupKm !== undefined
      ? `${pickupKm.toFixed(1)} km · ~${estimateEtaMinutes(pickupKm)} min`
      : null;

  const isGroupRide = offer.isGroupRide === true;
  const riderCount = offer.riderCount ?? 1;
  const hasSeats = isGroupRide && (offer.groupMembers?.length ?? 0) > 0;
  const answeredSeatCount = (offer.groupMembers ?? []).filter(
    (seat) => seatBids[seat.rideId] !== undefined,
  ).length;
  const stopCount = offer.stops.length + 2; // intermediates plus both ends

  // One ordered timeline: first pickup, every waypoint between, final drop-off.
  // Solo rides collapse to the same two-row shape the screen always had.
  const routeStops = buildRouteStops({
    pickup: offer.pickup.address,
    destination: offer.destination.address,
    stops: offer.stops.map((s) => s.address),
    stopKinds: offer.stopKinds,
    isGroupRide,
  });

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />

      {/* Dimmed background — tap to dismiss */}
      <Animated.View entering={FadeIn.duration(200)} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleDismiss} />
      </Animated.View>

      {/* Swipeable card */}
      <Animated.View
        entering={FadeInDown.duration(350).springify().damping(18)}
        style={[
          styles.cardWrap,
          cardAnimatedStyle,
          {
            // Never taller than the screen, and always clear of the keyboard
            // so the bid field stays visible while typing.
            maxHeight: responsive.height - keyboardHeight - insets.top - responsive.scale(24),
            // The card is anchored to the bottom of the SCREEN — without this
            // it stays put and the keyboard covers the bid field on every
            // device. Lift the whole sheet by the keyboard's height instead.
            marginBottom: keyboardHeight,
            paddingBottom:
              keyboardHeight > 0
                ? responsive.scale(8)
                : Math.max(insets.bottom, responsive.scale(16)),
          },
        ]}
      >
        {/* Swipe handle — the drag target, kept outside the scroll area so
            swipe-to-dismiss and scrolling never fight each other. */}
        <GestureDetector gesture={panGesture}>
          <View style={styles.handleWrap}>
            <View style={styles.handle} />
          </View>
        </GestureDetector>

        <ScrollView
          ref={sheetScrollRef}
          bounces={false}
          contentContainerStyle={[styles.cardScrollContent, { gap: responsive.scale(12) }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {/* Request switcher — every live request as a chip, so a second one
              arriving is visible and reachable instead of replacing this one
              off-screen. Bidding on one does not lose the others. */}
          {session.offers.length > 1 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.switcherRow}>
              {session.offers.map((queued, index) => {
                const active = queued.rideId === offer.rideId;
                return (
                  <Pressable
                    key={queued.rideId}
                    onPress={() => {
                      if (active) return;
                      void stopRideRequestSound();
                      selectOffer(queued.rideId);
                    }}
                    style={[styles.switcherChip, active && styles.switcherChipActive]}>
                    <AppText
                      variant="monoSmall"
                      color={active ? theme.colors.white : theme.colors.muted}>
                      #{index + 1}
                    </AppText>
                    <AppText
                      variant="label"
                      color={active ? theme.colors.white : theme.colors.black}>
                      {formatNgn(queued.riderOfferNgn ?? queued.fareEstimateNgn)}
                    </AppText>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}

          {/* Header row */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              {isGroupRide ? (
                <View style={styles.groupBadge}>
                  <View style={styles.groupBadgeDots}>
                    {Array.from({ length: Math.min(riderCount, 4) }).map((_, i) => (
                      <View key={i} style={[styles.groupBadgeDot, i > 0 && styles.groupBadgeDotOverlap]} />
                    ))}
                  </View>
                  <AppText variant="monoSmall" color={theme.colors.orange}>
                    GROUP · {riderCount} RIDERS
                  </AppText>
                </View>
              ) : (
                <AppText variant="monoSmall" color={theme.colors.muted}>
                  NEW REQUEST
                </AppText>
              )}
              <AppText variant="h2">{isGroupRide ? 'Shared ride' : 'Ride request'}</AppText>
            </View>
            <View style={styles.timerBadge}>
              <AppText variant="monoSmall" color={theme.colors.muted}>
                OPEN
              </AppText>
            </View>
          </View>

          {/* Per-seat negotiation: each rider set their own price — answer each. */}
          {isGroupRide && offer.groupMembers && offer.groupMembers.length > 0 && (
            <View style={styles.seatsCard}>
              <AppText variant="monoSmall" color={theme.colors.muted}>
                {offer.groupMembers.length} RIDERS · NEGOTIATE EACH SEAT
              </AppText>
              {offer.groupMembers.map((seat, index) => {
                const sentAmount = seatBids[seat.rideId];
                return (
                  <View key={seat.rideId} style={styles.seatRow}>
                    <View style={styles.seatInfo}>
                      <AppText variant="label">
                        Rider {index + 1} · offers ₦{seat.offerNgn.toLocaleString()}
                      </AppText>
                      <AppText variant="bodySmall" color={theme.colors.muted} numberOfLines={1}>
                        {seat.pickup.address} → {seat.dropoff.address}
                      </AppText>
                      {sentAmount !== undefined && (
                        <AppText variant="bodySmall" color={theme.colors.orange}>
                          Your offer: ₦{sentAmount.toLocaleString()} — waiting on rider
                        </AppText>
                      )}
                    </View>
                    {sentAmount === undefined && (
                      seatBidMode === seat.rideId ? (
                        <View style={styles.seatBidRow}>
                          <TextInput
                            autoFocus
                            keyboardType="number-pad"
                            onChangeText={setSeatBidAmount}
                            placeholder={`${seat.offerNgn}`}
                            placeholderTextColor={theme.colors.mutedLight}
                            style={styles.seatBidInput}
                            value={seatBidAmount}
                          />
                          <Pressable
                            onPress={() => void handleSeatBid(seat)}
                            style={styles.seatBtn}
                          >
                            <AppText variant="bodySmall" color={theme.colors.white}>Send</AppText>
                          </Pressable>
                        </View>
                      ) : (
                        <View style={styles.seatActions}>
                          <Pressable
                            onPress={() => void handleSeatAccept(seat)}
                            style={styles.seatBtn}
                          >
                            <AppText variant="bodySmall" color={theme.colors.white}>
                              Accept ₦{seat.offerNgn.toLocaleString()}
                            </AppText>
                          </Pressable>
                          <Pressable
                            onPress={() => {
                              setSeatBidMode(seat.rideId);
                              setSeatBidAmount('');
                            }}
                            style={styles.seatBtnOutline}
                          >
                            <AppText variant="bodySmall" color={theme.colors.black}>Bid</AppText>
                          </Pressable>
                        </View>
                      )
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {/* Group rides are a different job at the same distance — say so up front. */}
          {isGroupRide && (
            <View style={styles.groupNotice}>
              <AppText variant="bodySmall" color={theme.colors.black}>
                {stopCount} stops · pick up and drop {riderCount} riders along one route
              </AppText>
            </View>
          )}

          {/* Route — a full stop-by-stop timeline when several riders share it,
              so the driver can see the real shape of the job before bidding. */}
          <View style={styles.routeCard}>
            {routeStops.map((stop, index) => {
              const isLast = index === routeStops.length - 1;
              return (
                <View key={`${stop.label}-${index}`} style={styles.timelineRow}>
                  <View style={styles.timelineGutter}>
                    <View
                      style={[
                        styles.timelineMarker,
                        stop.kind === 'pickup'
                          ? styles.timelineMarkerPickup
                          : styles.timelineMarkerDropoff,
                      ]}>
                      {stop.seat ? (
                        <AppText variant="monoSmall" color={theme.colors.white}>
                          {stop.seat}
                        </AppText>
                      ) : null}
                    </View>
                    {!isLast && <View style={styles.timelineLine} />}
                  </View>
                  <View style={[styles.timelineBody, !isLast && styles.timelineBodySpaced]}>
                    <AppText variant="bodySmall" color={theme.colors.muted}>
                      {stop.label}
                    </AppText>
                    <AppText variant="bodyMedium" numberOfLines={2}>
                      {stop.address}
                    </AppText>
                  </View>
                </View>
              );
            })}
          </View>

          {/* Driver→pickup, live */}
          {toPickupLabel ? (
            <View style={styles.toPickupCard}>
              <AppText variant="bodySmall" color={theme.colors.muted} numberOfLines={1}>
                To pickup
              </AppText>
              <AppText variant="h3" adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={1}>
                {toPickupLabel}
              </AppText>
            </View>
          ) : null}

          {/* Metrics row */}
          <View style={styles.metricsRow}>
            <View style={styles.metricCard}>
              <AppText variant="bodySmall" color={theme.colors.muted} numberOfLines={1}>Distance</AppText>
              <AppText variant="h3" adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={1}>
                {distanceKm}
              </AppText>
            </View>
            <View style={styles.metricCard}>
              <AppText variant="bodySmall" color={theme.colors.muted} numberOfLines={1}>Duration</AppText>
              <AppText variant="h3" adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={1}>
                {durationMin}
              </AppText>
            </View>
            <View style={styles.metricCard}>
              <AppText variant="bodySmall" color={theme.colors.muted} numberOfLines={1}>
                {lastBidNgn ? 'Your bid' : "Rider's offer"}
              </AppText>
              <AppText variant="h3" adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={1}>
                {formatNgn(activeFare)}
              </AppText>
            </View>
          </View>

          {/* What the driver takes home at this price — one line, no ledger. */}
          <View style={styles.earnRow}>
            <AppText variant="label" color={theme.colors.muted}>You earn</AppText>
            <AppText variant="h3" color={theme.colors.green}>{formatNgn(driverPayout)}</AppText>
          </View>

          {/* Actions — per-seat groups negotiate above; a lump-sum accept has
              no rider on the other end to approve it. */}
          {hasSeats ? (
            <View style={styles.bidSentWrap}>
              {answeredSeatCount > 0 ? (
                <>
                  <AppText variant="label" color={theme.colors.green}>
                    {answeredSeatCount}/{offer.groupMembers!.length} seats answered
                  </AppText>
                  <AppText variant="bodySmall" color={theme.colors.muted}>
                    Riders confirm their own seats — the trip starts when every seat agrees with you.
                  </AppText>
                </>
              ) : (
                <AppButton
                  title={`Accept all seats · ${formatNgn(offer.groupMembers!.reduce((sum, s) => sum + s.offerNgn, 0))}`}
                  onPress={handleAcceptAllSeats}
                  style={styles.acceptBtn}
                />
              )}
            </View>
          ) : bidSent ? (
            <View style={styles.bidSentWrap}>
              <AppText variant="label" color={theme.colors.green}>
                {lastBidNgn ? `Bid of ${formatNgn(lastBidNgn)} sent` : 'Offer accepted'}
              </AppText>
              <AppText variant="bodySmall" color={theme.colors.muted}>
                Waiting for rider to confirm...
              </AppText>
            </View>
          ) : bidMode ? (
            <View style={styles.bidInputWrap}>
              <View style={styles.bidInputRow}>
                <AppText variant="h3" color={theme.colors.muted}>₦</AppText>
                <TextInput
                  ref={bidInputRef}
                  style={styles.bidInput}
                  value={bidAmount}
                  onChangeText={setBidAmount}
                  placeholder="Your price"
                  placeholderTextColor={theme.colors.mutedLight}
                  keyboardType="number-pad"
                  returnKeyType="done"
                  onSubmitEditing={handleSubmitBid}
                />
              </View>
              <AppText variant="bodySmall" color={theme.colors.muted} style={styles.bidCapHint}>
                Any amount. The rider picks.
              </AppText>
              <View style={styles.bidActions}>
                <Pressable onPress={handleCancelBid} style={styles.bidCancelBtn}>
                  <AppText variant="label" color={theme.colors.muted}>Cancel</AppText>
                </Pressable>
                <AppButton
                  title="Submit bid"
                  onPress={handleSubmitBid}
                  style={styles.bidSubmitBtn}
                />
              </View>
            </View>
          ) : (
            <View>
              {/* One tap: the rider's price, or a suggested price. "Other amount" opens the box. */}
              <View style={styles.actions}>
                <AppButton title={`Accept ${formatNgn(activeFare)}`} onPress={handleAccept} style={styles.acceptBtn} />
              </View>
              <AppText variant="caption" color={theme.colors.muted} style={styles.suggestionHint}>OR BID HIGHER</AppText>
              <View style={styles.suggestionRow}>
                {suggestedBidsNgn(activeFare).map((amount) => (
                  <Pressable
                    key={amount}
                    onPress={() => { setBidAmount(String(amount)); void handleSubmitBidAt(amount); }}
                    style={({ pressed }) => [styles.suggestionChip, pressed && { opacity: 0.7 }]}>
                    <AppText variant="h3" adjustsFontSizeToFit minimumFontScale={0.75} numberOfLines={1}>
                      {formatNgn(amount)}
                    </AppText>
                  </Pressable>
                ))}
              </View>
              <Pressable onPress={handleBidPress} style={({ pressed }) => [styles.otherAmountBtn, pressed && { opacity: 0.7 }]}>
                <AppText variant="label" color={theme.colors.muted}>Other amount</AppText>
              </Pressable>
            </View>
          )}

          {/* Explicit exit — swiping alone is invisible UX. Declining is only
              offered before any bid; after one, closing keeps the bid alive. */}
          {!bidSent ? (
            <Pressable onPress={() => void handleDecline()} style={styles.declineBtn}>
              <AppText variant="label" color={theme.colors.danger}>Decline ride</AppText>
            </Pressable>
          ) : (
            <Pressable onPress={() => router.back()} style={styles.declineBtn}>
              <AppText variant="label" color={theme.colors.muted}>Close — keep my bid</AppText>
            </Pressable>
          )}

          {/* Hint */}
          <AppText variant="bodySmall" color={theme.colors.mutedLight} style={styles.hint}>
            or swipe down to leave it open
          </AppText>
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  cardWrap: {
    backgroundColor: theme.colors.offWhite,
    borderTopLeftRadius: theme.radii.lg,
    borderTopRightRadius: theme.radii.lg,
    borderWidth: theme.borders.thick,
    borderBottomWidth: 0,
    borderColor: theme.colors.black,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
  },
  cardScrollContent: {
    paddingBottom: theme.spacing.sm,
  },

  // Handle
  handleWrap: {
    alignItems: 'center',
    // Generous vertical padding: this is now the only drag target.
    paddingVertical: theme.spacing.sm,
  },
  handle: {
    width: 48,
    height: 5,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.borderLight,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    gap: 2,
  },
  timerBadge: {
    width: 52,
    height: 52,
    borderRadius: theme.radii.pill,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadows.subtle,
  },

  // Group badge
  groupBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.orangeLight,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.orange,
    borderRadius: theme.radii.pill,
    paddingVertical: 3,
    paddingHorizontal: theme.spacing.sm,
  },
  groupBadgeDots: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  groupBadgeDot: {
    width: 9,
    height: 9,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.orange,
    borderWidth: 1,
    borderColor: theme.colors.orangeLight,
  },
  groupBadgeDotOverlap: {
    marginLeft: -3,
  },
  seatsCard: {
    backgroundColor: theme.colors.white,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    borderRadius: theme.radii.sm,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    ...theme.shadows.subtle,
  },
  seatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
    paddingTop: theme.spacing.sm,
  },
  seatInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  seatActions: {
    flexDirection: 'row',
    gap: 6,
  },
  seatBidRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  seatBidInput: {
    width: 82,
    fontFamily: 'ClashDisplay_700Bold',
    fontSize: 16,
    color: theme.colors.black,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.black,
    borderRadius: theme.radii.sm,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  seatBtn: {
    backgroundColor: theme.colors.black,
    borderRadius: theme.radii.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  seatBtnOutline: {
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.black,
    borderRadius: theme.radii.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  declineBtn: {
    alignSelf: 'center',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.xs,
  },
  stillOpenNotice: {
    backgroundColor: theme.colors.white,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.borderLight,
    borderRadius: theme.radii.sm,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  groupNotice: {
    backgroundColor: theme.colors.orangeLight,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.orange,
    borderRadius: theme.radii.sm,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },

  // Route card
  routeCard: {
    backgroundColor: theme.colors.white,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    borderRadius: theme.radii.sm,
    padding: theme.spacing.md,
    ...theme.shadows.subtle,
  },

  // Stop timeline
  timelineRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  timelineGutter: {
    alignItems: 'center',
    width: 22,
  },
  timelineMarker: {
    width: 22,
    height: 22,
    borderRadius: theme.radii.pill,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.black,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineMarkerPickup: {
    backgroundColor: theme.colors.green,
  },
  timelineMarkerDropoff: {
    backgroundColor: theme.colors.black,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    minHeight: 14,
    backgroundColor: theme.colors.borderLight,
    marginVertical: 2,
  },
  timelineBody: {
    flex: 1,
    gap: 1,
    paddingTop: 1,
  },
  timelineBodySpaced: {
    paddingBottom: theme.spacing.md,
  },
  routeConnector: {
    alignItems: 'center',
    paddingTop: 4,
    gap: 0,
  },
  routeDot: {
    width: 10,
    height: 10,
    borderRadius: theme.radii.pill,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.black,
  },
  routeLine: {
    width: 2,
    flex: 1,
    backgroundColor: theme.colors.borderLight,
    marginVertical: 2,
  },
  routeLabels: {
    flex: 1,
    gap: theme.spacing.sm,
  },
  routeStop: {
    gap: 2,
  },
  routeDivider: {
    height: 1,
    backgroundColor: theme.colors.borderLight,
  },

  // Metrics
  toPickupCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.colors.white,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    borderRadius: theme.radii.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    ...theme.shadows.subtle,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  metricCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: theme.colors.white,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    borderRadius: theme.radii.sm,
    padding: theme.spacing.sm,
    gap: 4,
    alignItems: 'center',
    ...theme.shadows.subtle,
  },

  // What the driver earns — one row
  earnRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.colors.white,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    borderRadius: theme.radii.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    ...theme.shadows.subtle,
  },

  // Actions
  switcherRow: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
    paddingBottom: 2,
  },
  switcherChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.orangeLight,
  },
  switcherChipActive: {
    backgroundColor: theme.colors.orange,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'stretch',
    width: '100%',
    gap: theme.spacing.sm,
  },
  // flex alone lets a button grow past the row on narrow screens — the label
  // sets an implicit minimum width that flex will not shrink below. minWidth:0
  // plus flexShrink lets them actually fit.
  acceptBtn: {
    flex: 2,
    minWidth: 0,
    flexShrink: 1,
  },
  suggestionHint: {
    marginTop: theme.spacing.sm,
    marginBottom: 6,
    letterSpacing: 0.6,
  },
  // Three prices, equal width, the number filling each chip.
  suggestionRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  suggestionChip: {
    flex: 1,
    minWidth: 0,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xs,
    borderRadius: theme.radii.sm,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.white,
  },
  otherAmountBtn: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    marginTop: theme.spacing.sm,
    borderRadius: theme.radii.sm,
    borderWidth: 1.5,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.white,
  },
  bidBtn: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
  },

  // Bid input
  bidCapHint: {
    marginTop: 6,
    textAlign: 'center',
  },
  bidInputWrap: {
    gap: theme.spacing.sm,
  },
  bidInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.white,
    paddingHorizontal: theme.spacing.md,
    minHeight: 52,
    ...theme.shadows.subtle,
  },
  bidInput: {
    flex: 1,
    fontFamily: 'ClashDisplay_700Bold',
    fontSize: 22,
    color: theme.colors.black,
    paddingVertical: 0,
  },
  bidActions: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    gap: theme.spacing.sm,
  },
  bidCancelBtn: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  bidSubmitBtn: {
    flex: 2,
    minWidth: 0,
    flexShrink: 1,
  },

  // Bid sent
  bidSentWrap: {
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.white,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.green,
    borderRadius: theme.radii.sm,
  },

  // Hint
  hint: {
    textAlign: 'center',
  },
});
