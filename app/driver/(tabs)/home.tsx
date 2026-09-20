import { Href, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Platform, Pressable, StyleSheet, View } from 'react-native';
import MapView, { Circle, PROVIDER_GOOGLE } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { useNearbyAlerts } from '@/components/nearby-alerts';
import { useAuth } from '@/lib/auth';
import { getAccessTokenWithRetry } from '@/lib/access-token';
import { getDriverStats, getDriverEarnings, type DriverStatsResponse } from '@/lib/api';
import { DriverRequestFeed } from '@/components/driver-request-feed';
import { useDriverSession } from '@/lib/driver-session';
import { ringDeadlineMs } from '@/lib/driver-session-reducer';
import { useAppLocation } from '@/lib/location';
import { useAppNotifications } from '@/lib/notifications';
import { useQuestBadge } from '@/lib/quest-badge-context';
import { useResponsive } from '@/lib/responsive';
import { playBidAlertChime, playRideRequestSound, stopRideRequestSound } from '@/lib/sounds';
import { theme } from '@/theme';

function countCompletedQuests(todayRides: number, todayEarnings: number, totalRides: number, rating: number): number {
  let count = 0;
  if (todayRides >= 5) count++;   // Daily Grind
  if (todayRides >= 10) count++;  // Road Warrior
  if (todayEarnings >= 10000) count++; // Big Earner
  if (rating >= 4.8 && rating > 0) count++; // Five Star Driver
  if (totalRides >= 100) count++; // Century Club
  return count;
}

function formatNgn(amount: number): string {
  return `NGN ${Math.round(amount).toLocaleString('en-NG')}`;
}

const LAGOS_REGION = {
  latitude: 6.4478,
  longitude: 3.4401,
  latitudeDelta: 0.035,
  longitudeDelta: 0.025,
};


export default function DriverHomeScreen() {
  const router = useRouter();
  const { getAccessToken } = useAuth();
  const { session, goOnline, goOffline, sendGps } = useDriverSession();

  // Every live request. The driver picks one from this list — nothing opens by
  // itself, which is both what a driver expects and what stops the screen
  // flipping between home and the request card.
  const waitingOffers = session.offers;
  // Bids sent and still unanswered — the driver's money on the table. Shown
  // even after the offer card expires, so leaving the request screen never
  // means losing sight of what's pending.
  const pendingBids = Object.values(session.pendingBids ?? {});
  const { permissionState, requestLocationAccess, requestBackgroundLocationAccess, currentLocation } =
    useAppLocation();

  const { permissionGranted, requestNotificationAccess } = useAppNotifications();
  const { reportCompletedCount } = useQuestBadge();
  const insets = useSafeAreaInsets();
  const responsive = useResponsive();
  const notificationPromptedRef = useRef(false);
  const mapRef = useRef<MapView>(null);

  const [stats, setStats] = useState<DriverStatsResponse | null>(null);
  const [todayEarnings, setTodayEarnings] = useState<number>(0);

  useEffect(() => {
    if (permissionState !== 'idle') return;
    void requestLocationAccess();
  }, [permissionState, requestLocationAccess]);

  useEffect(() => {
    if (notificationPromptedRef.current || permissionGranted) return;
    notificationPromptedRef.current = true;
    void requestNotificationAccess();
  }, [permissionGranted, requestNotificationAccess]);

  useEffect(() => {
    void (async () => {
      try {
        const accessToken = await getAccessTokenWithRetry(getAccessToken);
        if (!accessToken) return;
        const [driverStats, earnings] = await Promise.all([
          getDriverStats({ accessToken }),
          getDriverEarnings({ accessToken, period: 'today' }),
        ]);
        setStats(driverStats);
        setTodayEarnings(earnings.totalEarningsNgn);
        reportCompletedCount(countCompletedQuests(
          earnings.rideCount,
          earnings.totalEarningsNgn,
          driverStats.totalRides,
          driverStats.rating,
        ));
      } catch {
        // non-blocking
      }
    })();
    // Both deps are stable by construction (useCallback with empty deps), so
    // this runs once per mount. That matters more than it looks: this effect
    // fires two network calls, and anything that makes either identity change
    // per render turns it into a request flood.
  }, [getAccessToken, reportCompletedCount]);

  // Requests are NOT auto-opened. Pushing the request screen automatically
  // fought with that screen's own "no offer → go home" redirect: push → replace
  // → home remounts → push again, which is the flicker you see. The driver taps
  // a request from the list below instead.
  //
  // Because nothing opens on its own, the alert has to live here. Two clocks:
  // the request stays biddable for its full backend TTL, but it only RINGS
  // for its 30s ring window (RING_WINDOW_MS). The ring also dies the moment
  // the app leaves the foreground, and haptics pulse alongside so a phone on
  // silent still gets a physical alert.
  const offers = session.offers;
  const bidsByRide = session.pendingBids;
  useEffect(() => {
    const now = Date.now();
    const ringUntil = offers
      .filter((offer) => !bidsByRide[offer.rideId])
      .reduce((latest, offer) => Math.max(latest, ringDeadlineMs(offer)), 0);

    if (ringUntil <= now) {
      void stopRideRequestSound();
      return;
    }

    void playRideRequestSound();
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    const hapticPulse = setInterval(() => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }, 2500);
    const stopAtDeadline = setTimeout(() => {
      clearInterval(hapticPulse);
      void stopRideRequestSound();
    }, ringUntil - now);
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') void stopRideRequestSound();
    });

    return () => {
      clearTimeout(stopAtDeadline);
      clearInterval(hapticPulse);
      appStateSub.remove();
      void stopRideRequestSound();
    };
  }, [offers, bidsByRide]);

  // A rider talking back to a bid deserves a chirp even when the driver has
  // long left the request screen — one short alert per counter, no loop.
  const counterBaselineRef = useRef<number | null>(null);
  useEffect(() => {
    let latest = 0;
    for (const bid of Object.values(bidsByRide)) {
      if (bid.counteredAt) {
        const at = Date.parse(bid.counteredAt);
        if (Number.isFinite(at)) latest = Math.max(latest, at);
      }
    }
    if (counterBaselineRef.current === null) {
      counterBaselineRef.current = latest;
      return;
    }
    if (latest > counterBaselineRef.current) {
      counterBaselineRef.current = latest;
      void playBidAlertChime();
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }
  }, [bidsByRide]);

  // A request slipping away unanswered gets one honest buzz — the missed
  // card in the Active tab tells the rest of the story.
  const missedCountRef = useRef(session.missedOffers.length);
  useEffect(() => {
    if (session.missedOffers.length > missedCountRef.current) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
    missedCountRef.current = session.missedOffers.length;
  }, [session.missedOffers.length]);

  // Center map on user location when available
  useEffect(() => {
    if (currentLocation && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: currentLocation.lat,
        longitude: currentLocation.lng,
        latitudeDelta: 0.015,
        longitudeDelta: 0.012,
      }, 600);
    }
  }, [currentLocation]);

  const isOnline = session.status !== 'offline';
  const nearbyAlerts = useNearbyAlerts(getAccessToken, isOnline);

  // An honest read on silence: how long since anything happened. Fifteen
  // quiet minutes means the driver is probably parked outside demand — say
  // so instead of pretending requests are imminent.
  const lastActivityRef = useRef<number>(Date.now());
  const [quietMinutes, setQuietMinutes] = useState(0);
  useEffect(() => {
    lastActivityRef.current = Date.now();
    setQuietMinutes(0);
  }, [isOnline, session.offers.length, pendingBids.length]);
  useEffect(() => {
    if (!isOnline) return;
    const timer = setInterval(() => {
      setQuietMinutes(Math.floor((Date.now() - lastActivityRef.current) / 60_000));
    }, 60_000);
    return () => clearInterval(timer);
  }, [isOnline]);

  // Moving onto the trip screens when a match lands is DriverTripRouter's
  // job (it works from any tab). This screen only needs to offer the way
  // back in for a driver who came back to the map mid-trip.
  const currentRide = session.currentRide;
  const tripStatus = session.status;

  const tripScreenFor = (status: typeof tripStatus): Href | null =>
    status === 'navigating'
      ? ('/driver/navigation' as Href)
      : status === 'arrived'
        ? ('/driver/arrived' as Href)
        : status === 'active'
          ? ('/driver/active-trip' as Href)
          : null;

  // Idle position pings (~30s) while online with no active trip, so the
  // backend's copy of this driver's position — which drives matching and the
  // pickup distance riders see — doesn't stay frozen at the go-online spot.
  const lastIdleGpsAtRef = useRef(0);
  useEffect(() => {
    if (!isOnline || session.currentRide || !currentLocation) return;
    const now = Date.now();
    if (now - lastIdleGpsAtRef.current < 30_000) return;
    lastIdleGpsAtRef.current = now;
    sendGps(currentLocation.lat, currentLocation.lng);
  }, [isOnline, session.currentRide, currentLocation, sendGps]);
  const driverLat = currentLocation?.lat ?? LAGOS_REGION.latitude;
  const driverLng = currentLocation?.lng ?? LAGOS_REGION.longitude;

  const handleToggleOnline = async () => {
    try {
      if (isOnline) {
        // Going offline wipes the local session, but the backend still has
        // this driver on the trip — it would reappear on the next sync. Make
        // them finish or cancel it properly instead.
        if (currentRide) {
          Alert.alert(
            'Trip in progress',
            'Finish or cancel your current trip before going offline.',
            [
              { text: 'OK', style: 'cancel' },
              {
                text: 'Open trip',
                onPress: () => {
                  const target = tripScreenFor(tripStatus);
                  if (target) router.push(target);
                },
              },
            ],
          );
          return;
        }
        await goOffline();
        // The end of a shift is the one moment this question makes sense.
        // Asked once, ever; after that it lives in Settings.
        setTimeout(() => void nearbyAlerts.offerOnce(), 900);
      } else {
        if (!currentLocation) {
          Alert.alert('Location unavailable', 'We need your location to go online. Please enable location services.');
          return;
        }
        // Play prominent-disclosure flow: explain background location and ask
        // for "Allow all the time" before the driver starts receiving requests.
        // Going online still works in the foreground if they decline.
        await requestBackgroundLocationAccess();
        await goOnline(currentLocation.lat, currentLocation.lng);
      }
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not update status. Please try again.');
    }
  };

  const initialRegion = currentLocation
    ? {
        latitude: currentLocation.lat,
        longitude: currentLocation.lng,
        latitudeDelta: 0.015,
        longitudeDelta: 0.012,
      }
    : LAGOS_REGION;

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      {nearbyAlerts.sheet}

      {/* Full-screen map */}
      <MapView
        ref={mapRef}
        provider={Platform.OS === 'android' || Platform.OS === 'ios' ? PROVIDER_GOOGLE : undefined}
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        showsBuildings
        showsTraffic
        toolbarEnabled={false}
        pitchEnabled={false}
        rotateEnabled={false}
      >
        {isOnline && (
          <Circle
            center={{ latitude: driverLat, longitude: driverLng }}
            radius={400}
            fillColor="rgba(240,145,63,0.08)"
            strokeColor="rgba(240,145,63,0.25)"
            strokeWidth={1.5}
          />
        )}
      </MapView>

      {/* Top status bar overlay */}
      <View
        style={[
          styles.topOverlay,
          {
            top: insets.top + responsive.scale(12),
            left: responsive.gutter,
            right: responsive.gutter,
          },
        ]}>
        <View style={[styles.statusChip, isOnline ? styles.statusOnline : styles.statusOffline]}>
          <View style={[styles.statusDot, { backgroundColor: isOnline ? theme.colors.green : theme.colors.mutedLight }]} />
          <AppText variant="label" color={isOnline ? theme.colors.green : theme.colors.muted}>
            {isOnline ? 'Online' : 'Offline'}
          </AppText>
        </View>
      </View>

      {/* A trip already underway — the way back in after leaving the trip
          screen (swipe back, tab switch). Without it the driver was stranded
          on a map that only says "waiting for ride requests". */}
      {currentRide && tripScreenFor(tripStatus) ? (
        <View
          style={[
            styles.requestsOverlay,
            {
              top: insets.top + responsive.scale(56),
              left: responsive.gutter,
              right: responsive.gutter,
            },
          ]}>
          <Pressable
            onPress={() => {
              const target = tripScreenFor(tripStatus);
              if (target) router.push(target);
            }}
            style={({ pressed }) => [styles.pendingBidCard, pressed && styles.pendingBidPressed]}>
            <View style={styles.pendingBidRow}>
              <AppText variant="label" color={theme.colors.green}>
                🚗 Trip in progress · {formatNgn(currentRide.fareNgn)}
                {currentRide.riderPaid ? ' · paid' : ''}
              </AppText>
              <AppText variant="bodySmall" color={theme.colors.muted} numberOfLines={1}>
                {tripStatus === 'active'
                  ? `To ${currentRide.destination.address}`
                  : `Pickup at ${currentRide.pickup.address}`}
                {' — tap to open'}
              </AppText>
            </View>
          </Pressable>
        </View>
      ) : null}

      {/* The job feed — inDrive-style: one card per ride for its whole life.
          New requests carry Accept/price chips inline; a sent bid becomes the
          same card in a waiting state; a rider counter updates it in place. */}
      {!currentRide && (waitingOffers.length > 0 || pendingBids.length > 0) ? (
        <View
          style={[
            styles.requestsOverlay,
            {
              top: insets.top + responsive.scale(56),
              left: responsive.gutter,
              right: responsive.gutter,
            },
          ]}>
          <View style={styles.feedHeader}>
            <AppText variant="caption" color={theme.colors.muted}>
              {waitingOffers.length > 0
                ? `${waitingOffers.length + pendingBids.length} on the table`
                : 'Your bids'}
            </AppText>
            <Pressable onPress={() => router.push('/driver/(tabs)/history?tab=bids' as Href)}>
              <AppText variant="caption" color={theme.colors.orange}>All bids ›</AppText>
            </Pressable>
          </View>
          <DriverRequestFeed />
        </View>
      ) : null}

      {/* Bottom card overlay */}
      <View
        style={[
          styles.bottomOverlay,
          {
            bottom: Math.max(insets.bottom, responsive.scale(12)),
            left: responsive.gutter,
            right: responsive.gutter,
            gap: responsive.scale(12),
          },
        ]}>
        {/* Metrics row */}
        <View style={[styles.metricsCard, { paddingVertical: responsive.scale(14) }]}>
          <View style={styles.metricItem}>
            <AppText variant="bodySmall" color={theme.colors.muted} numberOfLines={1}>Today</AppText>
            <AppText
              variant="h3"
              color={theme.colors.orange}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
              numberOfLines={1}>
              {formatNgn(todayEarnings)}
            </AppText>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricItem}>
            <AppText variant="bodySmall" color={theme.colors.muted} numberOfLines={1}>Rating</AppText>
            <AppText variant="h3" adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={1}>
              {stats ? stats.rating.toFixed(1) : '--'}
            </AppText>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricItem}>
            <AppText variant="bodySmall" color={theme.colors.muted} numberOfLines={1}>Rides</AppText>
            <AppText variant="h3" adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={1}>
              {stats ? String(stats.totalRides) : '--'}
            </AppText>
          </View>
        </View>

        {/* Go online/offline button */}
        <Pressable
          onPress={handleToggleOnline}
          style={({ pressed }) => [
            styles.toggleBtn,
            { minHeight: responsive.scale(52) },
            isOnline ? styles.toggleBtnOffline : styles.toggleBtnOnline,
            pressed && styles.toggleBtnPressed,
          ]}
        >
          <AppText
            variant="label"
            color={isOnline ? theme.colors.orange : theme.colors.white}
            numberOfLines={1}>
            {isOnline ? 'Go Offline' : 'Go Online'}
          </AppText>
        </Pressable>

        {!responsive.isShort && !isOnline && (
          <AppText variant="bodySmall" color={theme.colors.muted} style={styles.hint} numberOfLines={2}>
            Go online to start accepting ride requests
          </AppText>
        )}
        {!responsive.isShort && isOnline && (
          <AppText
            variant="bodySmall"
            color={quietMinutes >= 15 ? theme.colors.muted : theme.colors.green}
            style={styles.hint}
            numberOfLines={2}>
            {quietMinutes >= 15
              ? `Quiet here for ${quietMinutes} min — demand is usually strongest around Ikeja, Opebi & Yaba`
              : 'Waiting for ride requests nearby...'}
          </AppText>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.mapBase,
  },

  // Top overlay — position comes from safe-area insets at render time
  topOverlay: {
    position: 'absolute',
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    ...theme.shadows.subtle,
  },
  statusOnline: {
    backgroundColor: theme.colors.white,
  },
  statusOffline: {
    backgroundColor: theme.colors.white,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  // Bottom overlay — position comes from safe-area insets at render time
  bottomOverlay: {
    position: 'absolute',
  },
  requestsOverlay: {
    position: 'absolute',
  },
  feedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
    marginBottom: 6,
  },
  queueScroll: {
    maxHeight: 240,
  },
  distanceBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 58,
  },
  queueCard: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.lg,
    borderWidth: 2,
    borderColor: theme.colors.orange,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
    shadowColor: theme.colors.black,
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  queueHeading: {
    marginBottom: 0,
  },
  queueSub: {
    marginBottom: 4,
  },
  queueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.offWhite,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  queueRowPressed: {
    opacity: 0.6,
    backgroundColor: theme.colors.orangeLight,
  },
  pendingBidCard: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.lg,
    borderWidth: 1.5,
    borderColor: theme.colors.green,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 6,
  },
  allBidsLink: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pendingBidPressed: {
    opacity: 0.6,
  },
  pendingBidRow: {
    gap: 2,
  },
  queueRowText: {
    flex: 1,
    gap: 2,
  },
  metricsCard: {
    flexDirection: 'row',
    backgroundColor: theme.colors.white,
    borderRadius: theme.radii.md,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    ...theme.shadows.card,
  },
  metricItem: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 2,
  },
  metricDivider: {
    width: 1,
    height: 32,
    backgroundColor: theme.colors.borderLight,
  },

  // Toggle button
  toggleBtn: {
    borderRadius: theme.radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    ...theme.shadows.card,
  },
  toggleBtnOnline: {
    backgroundColor: theme.colors.orange,
  },
  toggleBtnOffline: {
    backgroundColor: theme.colors.black,
  },
  toggleBtnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },

  hint: {
    textAlign: 'center',
  },
});
