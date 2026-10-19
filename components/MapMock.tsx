import { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import { Circle, Marker, Polyline } from 'react-native-maps';

import { GoogleMapView } from '@/components/GoogleMapView';
import { InstructionCard } from '@/components/InstructionCard';
import { AppText, OnLight } from '@/components/app-text';
import { mapScenes, MapScene, RouteInstruction } from '@/data/mock';
import { theme } from '@/theme';

type MapVariant = 'riderTrip' | 'driverNavigation' | 'driverDashboard' | 'driverActive';

type MapMockProps = PropsWithChildren<{
  variant: MapVariant;
  height?: number;
  showRoute?: boolean;
  showCar?: boolean;
  showDestination?: boolean;
  showPulse?: boolean;
  showInstructionBanner?: boolean;
  instruction?: RouteInstruction;
  topBadge?: string;
}>;

const sceneByVariant = {
  riderTrip: mapScenes.riderTrip,
  driverNavigation: mapScenes.driverNavigation,
  driverDashboard: mapScenes.driverDashboard,
  driverActive: mapScenes.driverActive,
} as const;

export function MapMock({
  children,
  variant,
  height = 280,
  showRoute,
  showCar,
  showDestination,
  showPulse,
  showInstructionBanner,
  instruction,
  topBadge,
}: MapMockProps) {
  const scene: MapScene = sceneByVariant[variant];

  return (
    <View style={[styles.container, { height }]}>
      <OnLight>
      <GoogleMapView
        initialRegion={scene.region}
        pitchEnabled={false}
        rotateEnabled={false}
        scrollEnabled
        showsBuildings
        showsCompass={false}
        showsIndoors={false}
        showsTraffic
        style={StyleSheet.absoluteFill}
        toolbarEnabled={false}>
        {showRoute && scene.route ? (
          <Polyline coordinates={scene.route} strokeColor={theme.colors.orange} strokeWidth={5} />
        ) : null}
        {showPulse && scene.pulseMarker ? (
          <Circle
            center={scene.pulseMarker}
            fillColor="rgba(240,145,63,0.18)"
            radius={120}
            strokeColor={theme.colors.orange}
            strokeWidth={2}
          />
        ) : null}
        {showCar && scene.primaryMarker ? (
          <Marker coordinate={scene.primaryMarker}>
            <View style={[styles.marker, styles.carMarker]}>
              <OnLight>
              <AppText style={styles.emoji}>🚗</AppText>
              </OnLight>
            </View>
          </Marker>
        ) : null}
        {showDestination && scene.secondaryMarker ? (
          <Marker coordinate={scene.secondaryMarker}>
            <View style={[styles.marker, styles.destinationMarker]}>
              <AppText style={styles.emoji}>{variant === 'driverNavigation' ? '🟢' : '📍'}</AppText>
            </View>
          </Marker>
        ) : null}
      </GoogleMapView>

      {topBadge ? (
        <View style={styles.topBadge}>
          <AppText variant="monoSmall" color={theme.colors.offWhite}>
            {topBadge}
          </AppText>
        </View>
      ) : null}

      {showInstructionBanner && instruction ? (
        <View style={styles.instructionBanner}>
          <InstructionCard instruction={instruction} variant="banner" />
        </View>
      ) : null}

      <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        {children}
      </View>
      </OnLight>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.mapBase,
    overflow: 'hidden',
    position: 'relative',
  },
  marker: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  carMarker: {
    width: 30,
    height: 30,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.white,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.borderLight,
    ...theme.shadows.card,
  },
  destinationMarker: {
    width: 28,
    height: 28,
  },
  emoji: {
    fontSize: 16,
  },
  topBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 5,
    borderRadius: theme.radius.sm,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.black,
    ...theme.shadows.card,
  },
  instructionBanner: {
    position: 'absolute',
    left: theme.spacing.gutter,
    right: theme.spacing.gutter,
    bottom: 12,
  },
});
