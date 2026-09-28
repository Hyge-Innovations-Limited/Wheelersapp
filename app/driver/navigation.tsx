import { Href, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { Alert, Linking, Pressable, StyleSheet, View } from 'react-native';
import { Marker, Polyline } from 'react-native-maps';
import type MapView from 'react-native-maps';

import { AppButton } from '@/components/app-button';
import { CourseArrowMarker } from '@/components/course-arrow-marker';
import { AppCard } from '@/components/app-card';
import { AppScreen } from '@/components/app-screen';
import { AppText } from '@/components/app-text';
import { GoogleMapView } from '@/components/GoogleMapView';
import { StatusPill } from '@/components/StatusPill';
import { TripCallButton } from '@/components/TripCallButton';
import { TripChatButton } from '@/components/TripChatButton';
import { useDriverSession } from '@/lib/driver-session';
import { estimateEtaMinutes, haversineKm } from '@/lib/geo';
import { useAppLocation } from '@/lib/location';
import { useCourseBearing, useLiveRoute } from '@/lib/use-live-route';
import { useResponsive } from '@/lib/responsive';
import { theme } from '@/theme';

function formatNgn(amount: number): string {
  return `NGN ${Math.round(amount).toLocaleString('en-NG')}`;
}


export default function DriverNavigationScreen() {
  const router = useRouter();
  const { session, arriveAtPickup, cancelTrip, sendGps, chatMessages, sendChatMessage } = useDriverSession();
  const { currentLocation } = useAppLocation();
  const responsive = useResponsive();
  const ride = session.currentRide;
  const mapRef = useRef<MapView>(null);
  const lastGpsSentRef = useRef(0);

  // Heading to pickup: the line that matters is driver → pickup. The route
  // shipped with the offer is the whole trip (pickup → destination) and used
  // to be drawn here, which pointed the driver at the wrong thing.
  const { coords: liveRouteCoords } = useLiveRoute({
    origin: currentLocation,
    target: ride?.pickup ?? null,
    enabled: Boolean(ride),
  });
  const courseBearing = useCourseBearing(currentLocation, ride?.pickup ?? null);

  // Send GPS while navigating to pickup
  useEffect(() => {
    if (!currentLocation || !ride) return;
    const now = Date.now();
    if (now - lastGpsSentRef.current < 10000) return;
    lastGpsSentRef.current = now;
    sendGps(currentLocation.lat, currentLocation.lng);
  }, [currentLocation, ride, sendGps]);

  useEffect(() => {
    if (!ride) {
      router.replace('/driver/(tabs)/home' as Href);
    }
  }, [ride, router]);

  useEffect(() => {
    if (session.status === 'arrived') {
      router.replace('/driver/arrived' as Href);
    }
  }, [session.status, router]);

  // Fit map to show driver + pickup
  useEffect(() => {
    if (!ride || !mapRef.current) return;
    const coords = [
      { latitude: ride.pickup.lat, longitude: ride.pickup.lng },
    ];
    if (currentLocation) {
      coords.push({ latitude: currentLocation.lat, longitude: currentLocation.lng });
    }
    if (coords.length > 0) {
      mapRef.current.fitToCoordinates(coords, {
        edgePadding: { top: 60, right: 40, bottom: 40, left: 40 },
        animated: true,
      });
    }
  }, [ride, currentLocation]);

  const fallbackLine =
    liveRouteCoords.length < 2 && currentLocation && ride
      ? [
          { latitude: currentLocation.lat, longitude: currentLocation.lng },
          { latitude: ride.pickup.lat, longitude: ride.pickup.lng },
        ]
      : null;

  if (!ride) return null;

  const pickupCoord = { latitude: ride.pickup.lat, longitude: ride.pickup.lng };

  const initialRegion = {
    latitude: ride.pickup.lat,
    longitude: ride.pickup.lng,
    latitudeDelta: 0.02,
    longitudeDelta: 0.02,
  };

  // Live approach numbers: driver's GPS → rider's pickup. Recomputes every
  // location update, so they count down as the driver closes in.
  const pickupKm = currentLocation
    ? haversineKm(currentLocation.lat, currentLocation.lng, ride.pickup.lat, ride.pickup.lng)
    : null;
  const etaMinutes = pickupKm === null ? '--' : estimateEtaMinutes(pickupKm);
  const distanceKm =
    pickupKm === null ? '--' : pickupKm < 10 ? pickupKm.toFixed(1) : String(Math.round(pickupKm));

  // The trip itself, for context under the pickup address.
  const tripSummary = [
    ride.plannedDistanceKm ? `${ride.plannedDistanceKm.toFixed(1)} km trip` : null,
    ride.plannedDurationSeconds ? `~${Math.ceil(ride.plannedDurationSeconds / 60)} min` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  // The only exit from a trip that shouldn't happen — wrong pickup, rider
  // unreachable, a stale assignment reopened on launch. Without it the
  // driver is trapped on this screen.
  const handleCancelTrip = () => {
    Alert.alert(
      'Cancel this trip?',
      'The rider will be told and the ride goes back to them to re-match. Only do this if you cannot do the trip.',
      [
        { text: 'Keep trip', style: 'cancel' },
        {
          text: 'Cancel trip',
          style: 'destructive',
          onPress: async () => {
            try {
              await cancelTrip(ride.rideId, 'driver_cancelled');
            } catch (err) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Could not cancel the trip. Please try again.');
            }
          },
        },
      ],
    );
  };

  const handleArrived = async () => {
    try {
      await arriveAtPickup(ride.rideId);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not confirm arrival. Please try again.');
    }
  };

  return (
    <AppScreen backgroundColor={theme.colors.offWhite} scroll contentStyle={styles.container}>
      <StatusBar style="dark" backgroundColor={theme.colors.mapBase} />
      <View style={styles.mapWrap}>
        {/* Map takes a share of the screen rather than a fixed 280pt, so the
            stats, pickup card and CTA still fit on a 4.7" phone. */}
        <View style={[styles.mapContainer, { height: responsive.vh(32, 170, 340) }]}>
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
            {liveRouteCoords.length > 1 && (
              <Polyline coordinates={liveRouteCoords} strokeColor={theme.colors.orange} strokeWidth={5} />
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
            <Marker coordinate={pickupCoord}>
              <View style={styles.pickupMarker}>
                <View style={styles.pickupDot} />
              </View>
            </Marker>
          </GoogleMapView>
        </View>
      </View>

      <View style={styles.content}>
        <View style={styles.topRow}>
          <StatusPill
            dotColor={theme.colors.green}
            label="HEADING TO PICKUP"
            variant="dark"
          />
          {ride.riderPaid && (
            <StatusPill label="PAID" variant="green" />
          )}
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <AppText variant="monoLarge" color={theme.colors.orange} adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={1}>
              {etaMinutes}
            </AppText>
            <AppText variant="bodySmall" color={theme.colors.muted} numberOfLines={1}>min to rider</AppText>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <AppText variant="monoLarge" color={theme.colors.black} adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={1}>
              {distanceKm}
            </AppText>
            <AppText variant="bodySmall" color={theme.colors.muted} numberOfLines={1}>km to pickup</AppText>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <AppText variant="monoLarge" color={theme.colors.green} adjustsFontSizeToFit minimumFontScale={0.6} numberOfLines={1}>
              {formatNgn(ride.fareNgn)}
            </AppText>
            <AppText variant="bodySmall" color={theme.colors.muted} numberOfLines={1}>fare</AppText>
          </View>
        </View>

        {/* Pickup card */}
        <AppCard style={styles.pickupCard}>
          <View style={styles.pickupRow}>
            <View style={styles.pickupIcon}>
              <View style={styles.pickupIconDot} />
            </View>
            <View style={styles.pickupCopy}>
              <AppText variant="bodySmall" color={theme.colors.muted}>Pickup</AppText>
              <AppText variant="h3" numberOfLines={2}>{ride.pickup.address}</AppText>
              {tripSummary ? (
                <AppText variant="monoSmall" color={theme.colors.mutedLight}>
                  Then {tripSummary} to {ride.destination.address}
                </AppText>
              ) : null}
            </View>
          </View>
          <View style={styles.contactRow}>
            <TripChatButton
              rideId={ride.rideId}
              role="DRIVER"
              messages={chatMessages}
              onSend={sendChatMessage}
              otherName={ride.riderName}
              style={styles.contactButton}
            />
            <TripCallButton rideId={ride.rideId} otherRole="RIDER" otherName={ride.riderName} style={styles.contactButton} />
            {ride.riderPhone ? (
              <Pressable
                style={[styles.callButton, styles.contactButton]}
                onPress={() => Linking.openURL(`tel:${ride.riderPhone}`)}
              >
                <AppText variant="label">Phone</AppText>
              </Pressable>
            ) : null}
          </View>
        </AppCard>

        <AppButton title="I've arrived" onPress={handleArrived} />
        <Pressable onPress={handleCancelTrip} style={styles.cancelLink}>
          <AppText variant="bodySmall" color={theme.colors.muted}>
            Can&apos;t do this trip? Cancel
          </AppText>
        </Pressable>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  contactRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  contactButton: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: 0,
  },
  mapWrap: {
    borderBottomWidth: theme.borders.thick,
    borderBottomColor: theme.colors.black,
  },
  mapContainer: {
    backgroundColor: theme.colors.mapBase,
  },
  pickupMarker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.green,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickupDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.offWhite,
  },
  cancelLink: {
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: theme.spacing.gutter,
    paddingTop: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: theme.colors.white,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    borderRadius: theme.radii.sm,
    paddingVertical: theme.spacing.md,
    ...theme.shadows.card,
  },
  stat: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 4,
  },
  statDivider: {
    width: 1.5,
    backgroundColor: theme.colors.borderLight,
    alignSelf: 'stretch',
  },
  pickupCard: {
    gap: theme.spacing.sm,
  },
  pickupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  pickupIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.green,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickupIconDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.offWhite,
  },
  pickupCopy: {
    flex: 1,
    gap: 1,
  },
  callButton: {
    height: 42,
    borderRadius: theme.radii.sm,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.green,
    backgroundColor: theme.colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadows.subtle,
  },
});
