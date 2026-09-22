import { Href, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import type MapView from 'react-native-maps';
import { Marker, Polyline } from 'react-native-maps';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/app-button';
import { AppText } from '@/components/app-text';
import { CourseArrowMarker } from '@/components/course-arrow-marker';
import { EmergencyButton } from '@/components/emergency-button';
import { GoogleMapView } from '@/components/GoogleMapView';
import { TripProgressBar } from '@/components/TripProgressBar';
import { useDriverSession } from '@/lib/driver-session';
import { toUserMessage } from '@/lib/error-messages';
import { haversineKm } from '@/lib/geo';
import { useAppLocation } from '@/lib/location';
import { useCourseBearing, useLiveRoute } from '@/lib/use-live-route';
import { useResponsive } from '@/lib/responsive';
import { theme } from '@/theme';

function formatNgn(amount: number): string {
  return `NGN ${Math.round(amount).toLocaleString('en-NG')}`;
}

/** A live trip timer: 0:07 → 12:45 → 1:02:33. Coarse "1 min" reads frozen. */
function formatElapsed(seconds: number): string {
  const secs = Math.max(0, seconds);
  const hrs = Math.floor(secs / 3600);
  const mins = Math.floor((secs % 3600) / 60);
  const rem = secs % 60;
  const mmss = `${mins}:${String(rem).padStart(2, '0')}`;
  return hrs > 0 ? `${hrs}:${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}` : mmss;
}

/** Inside this, a driver is at the drop-off and ending the trip needs no question. */
const END_TRIP_NEAR_KM = 0.3;

export default function DriverActiveTripScreen() {
  const router = useRouter();
  const { session, endTrip, sendGps } = useDriverSession();
  const { currentLocation } = useAppLocation();
  const responsive = useResponsive();
  const insets = useSafeAreaInsets();
  const ride = session.currentRide;

  // Road from the driver's position to the drop-off, refreshed as they move —
  // the planned route (when it exists at all) starts at the pickup, not here.
  const { coords: liveRouteCoords } = useLiveRoute({
    origin: currentLocation,
    target: ride?.destination ?? null,
    enabled: Boolean(ride),
  });
  const courseBearing = useCourseBearing(currentLocation, ride?.destination ?? null);

  const mapRef = useRef<MapView>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const lastGpsSentRef = useRef(0);

  // Send GPS every time location changes (provider already throttles to 25m / 15s)
  useEffect(() => {
    if (!currentLocation || !ride) return;
    const now = Date.now();
    if (now - lastGpsSentRef.current < 10000) return; // min 10s between sends
    lastGpsSentRef.current = now;
    sendGps(currentLocation.lat, currentLocation.lng);
  }, [currentLocation, ride, sendGps]);

  useEffect(() => {
    if (!ride) {
      router.replace('/driver/(tabs)/home' as Href);
      return;
    }

    const startedAt = ride.startedAt ? new Date(ride.startedAt).getTime() : Date.now();
    const tick = () => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [ride, router]);

  useEffect(() => {
    if (session.status === 'completed') {
      router.replace('/driver/payout' as Href);
    }
  }, [session.status, router]);

  // Fit map to show route
  useEffect(() => {
    if (!ride || !mapRef.current) return;
    const coords = [
      { latitude: ride.pickup.lat, longitude: ride.pickup.lng },
      { latitude: ride.destination.lat, longitude: ride.destination.lng },
    ];
    if (currentLocation) {
      coords.push({ latitude: currentLocation.lat, longitude: currentLocation.lng });
    }
    mapRef.current.fitToCoordinates(coords, {
      // The bottom padding clears the floating trip panel — without it the
      // destination half of the route sits underneath the card.
      edgePadding: { top: 90, right: 40, bottom: 300, left: 40 },
      animated: true,
    });
  }, [ride, currentLocation]);

  // Hooks before any early return. This memo used to sit below the null
  // check, so the render where `ride` clears — trip completed or cancelled,
  // while the driver is on this very screen — changed the hook count and
  // crashed React mid-transition.
  const plannedCoords = useMemo(() => {
    if (!ride?.route?.coordinates) return [];
    return ride.route.coordinates.map((c) => ({ latitude: c.lat, longitude: c.lng }));
  }, [ride?.route]);

  // Best line we can draw, in order of truth: live driver→drop-off road,
  // the planned trip route, else a straight dashed pointer at the target.
  const routeCoords = liveRouteCoords.length > 1 ? liveRouteCoords : plannedCoords;
  const fallbackLine =
    routeCoords.length < 2 && currentLocation
      ? [
          { latitude: currentLocation.lat, longitude: currentLocation.lng },
          { latitude: ride?.destination.lat ?? 0, longitude: ride?.destination.lng ?? 0 },
        ]
      : null;

  if (!ride) return null;

  const destinationCoord = { latitude: ride.destination.lat, longitude: ride.destination.lng };

  const initialRegion = {
    latitude: (ride.pickup.lat + ride.destination.lat) / 2,
    longitude: (ride.pickup.lng + ride.destination.lng) / 2,
    latitudeDelta: Math.abs(ride.pickup.lat - ride.destination.lat) * 1.5 || 0.02,
    longitudeDelta: Math.abs(ride.pickup.lng - ride.destination.lng) * 1.5 || 0.02,
  };

  const liveDistanceKm = ride.liveDistanceKm ?? 0;
  const plannedDistanceKm = ride.plannedDistanceKm ?? 0;
  const distanceProgress = plannedDistanceKm > 0
    ? Math.min(1, liveDistanceKm / plannedDistanceKm)
    : 0;

  const endRide = async () => {
    try {
      await endTrip(ride.rideId);
    } catch (err) {
      Alert.alert('Could not end this ride', toUserMessage(err, 'Please try again in a moment.'));
    }
  };

  const handleEndRide = () => {
    // Ending early is sometimes right — a blocked street, a rider who wants out
    // here — so this asks rather than refuses. But the fare is settled on this
    // tap, and a rider dropped short of where they paid to reach has no way
    // back, so the distance is said out loud first.
    const awayKm = currentLocation
      ? haversineKm(currentLocation.lat, currentLocation.lng, ride.destination.lat, ride.destination.lng)
      : null;
    if (awayKm === null || awayKm <= END_TRIP_NEAR_KM) {
      void endRide();
      return;
    }
    Alert.alert(
      'You are not at the drop-off yet',
      `You are about ${awayKm < 10 ? awayKm.toFixed(1) : Math.round(awayKm)} km from ${ride.destination.address}. Ending now completes the trip and charges the rider the full fare.`,
      [
        { text: 'Keep driving', style: 'cancel' },
        { text: 'End anyway', style: 'destructive', onPress: () => void endRide() },
      ],
    );
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />

      {/* The map IS the screen — mid-trip, the road is what matters. All
          chrome floats above it in a compact panel. */}
      <GoogleMapView
        ref={mapRef}
        initialRegion={initialRegion}
        style={StyleSheet.absoluteFill}
        showsMyLocationButton={false}
        showsCompass={false}
        showsBuildings
        showsTraffic
        toolbarEnabled={false}
        pitchEnabled={false}
        rotateEnabled={false}
      >
        {routeCoords.length > 1 && (
          <Polyline coordinates={routeCoords} strokeColor={theme.colors.orange} strokeWidth={5} />
        )}
        {fallbackLine && (
          <Polyline
            coordinates={fallbackLine}
            strokeColor={theme.colors.orange}
            strokeWidth={4}
            lineDashPattern={[10, 8]}
          />
        )}
        {currentLocation && (
          <CourseArrowMarker
            coordinate={{ latitude: currentLocation.lat, longitude: currentLocation.lng }}
            bearing={courseBearing}
          />
        )}
        <Marker coordinate={destinationCoord}>
          <View style={styles.destinationMarker}>
            <View style={styles.destinationDot} />
          </View>
        </Marker>
      </GoogleMapView>

      {/* Top overlay: LIVE + SOS, out of the road's way */}
      <View
        style={[styles.topOverlay, { top: insets.top + responsive.scale(10) }]}
        pointerEvents="box-none">
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <AppText variant="monoSmall" color={theme.colors.offWhite}>LIVE</AppText>
        </View>
        <EmergencyButton role="DRIVER" rideId={ride.rideId} compact />
      </View>

      {/* Compact trip panel */}
      <View
        style={[
          styles.panel,
          {
            bottom: Math.max(insets.bottom, responsive.scale(12)),
            left: responsive.gutter,
            right: responsive.gutter,
          },
        ]}>
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <AppText variant="mono" color={theme.colors.orange} adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={1}>
              {formatElapsed(elapsedSeconds)}
            </AppText>
            <AppText variant="caption" color={theme.colors.muted} numberOfLines={1}>elapsed</AppText>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <AppText variant="mono" color={theme.colors.black} adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={1}>
              {liveDistanceKm.toFixed(1)} km
            </AppText>
            <AppText variant="caption" color={theme.colors.muted} numberOfLines={1}>traveled</AppText>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <AppText variant="mono" color={theme.colors.green} adjustsFontSizeToFit minimumFontScale={0.6} numberOfLines={1}>
              {formatNgn(ride.fareNgn)}
            </AppText>
            <AppText variant="caption" color={theme.colors.muted} numberOfLines={1}>fare</AppText>
          </View>
        </View>

        <TripProgressBar
          fillColor={theme.colors.orange}
          label={plannedDistanceKm > 0
            ? `${liveDistanceKm.toFixed(1)} of ${plannedDistanceKm.toFixed(1)} km`
            : `${liveDistanceKm.toFixed(1)} km traveled`
          }
          progress={distanceProgress}
        />

        {/* Drop-off, one line — the rider is in the car; no actions needed */}
        <View style={styles.dropoffRow}>
          <View style={styles.destinationIconSmall}>
            <View style={styles.destinationIconDotSmall} />
          </View>
          <AppText variant="bodySmall" numberOfLines={1} style={styles.dropoffText}>
            {ride.destination.address}
          </AppText>
        </View>

        <AppButton title="End ride" onPress={handleEndRide} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.mapBase,
  },
  topOverlay: {
    position: 'absolute',
    left: theme.spacing.gutter,
    right: theme.spacing.gutter,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 10,
  },
  destinationMarker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.orange,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    alignItems: 'center',
    justifyContent: 'center',
  },
  destinationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.offWhite,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 5,
    borderRadius: theme.radii.sm,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.black,
    ...theme.shadows.card,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: theme.colors.green,
  },
  panel: {
    position: 'absolute',
    backgroundColor: theme.colors.white,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.sm,
    ...theme.shadows.card,
  },
  statsRow: {
    flexDirection: 'row',
    paddingVertical: theme.spacing.xs,
  },
  stat: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    gap: 1,
    paddingHorizontal: 4,
  },
  statDivider: {
    width: 1.5,
    backgroundColor: theme.colors.borderLight,
    alignSelf: 'stretch',
  },
  dropoffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  destinationIconSmall: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: theme.colors.orange,
    borderWidth: 1.5,
    borderColor: theme.colors.black,
    alignItems: 'center',
    justifyContent: 'center',
  },
  destinationIconDotSmall: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.offWhite,
  },
  dropoffText: {
    flex: 1,
  },
});
