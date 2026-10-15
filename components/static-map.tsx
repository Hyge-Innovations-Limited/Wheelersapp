import { PropsWithChildren, useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Circle, Marker, Polyline } from 'react-native-maps';

import { GoogleMapView } from '@/components/GoogleMapView';
import { mapScenes, MapScene } from '@/data/mock';
import { theme } from '@/theme';

type StaticScene = 'riderHome' | 'rideSelection' | 'driverFound';

type StaticMapProps = PropsWithChildren<{
  height?: number;
  roundedTop?: boolean;
  scene?: StaticScene;
}>;

export function StaticMap({
  children,
  height = 280,
  roundedTop,
  scene = 'riderHome',
}: StaticMapProps) {
  const mapScene: MapScene = mapScenes[scene];

  return (
    <View
      style={[
        styles.container,
        {
          height,
          borderTopLeftRadius: roundedTop ? theme.radius.lg : 0,
          borderTopRightRadius: roundedTop ? theme.radius.lg : 0,
        },
      ]}>
      <GoogleMapView
        initialRegion={mapScene.region}
        mapPadding={Platform.select({ ios: undefined, default: undefined })}
        rotateEnabled={false}
        scrollEnabled
        showsBuildings
        showsCompass={false}
        showsIndoors={false}
        showsTraffic
        style={StyleSheet.absoluteFill}
        toolbarEnabled={false}>
        {mapScene.route ? (
          <Polyline coordinates={mapScene.route} strokeColor={theme.colors.orange} strokeWidth={5} />
        ) : null}
        {mapScene.route?.[0] ? (
          <Circle
            center={mapScene.route[0]}
            fillColor="rgba(0,196,140,0.15)"
            radius={55}
            strokeColor={theme.colors.green}
            strokeWidth={1.5}
          />
        ) : null}
        {mapScene.primaryMarker ? (
          <Marker coordinate={mapScene.primaryMarker}>
            <View style={[styles.marker, styles.startMarker]} />
          </Marker>
        ) : null}
        {mapScene.secondaryMarker ? (
          <Marker coordinate={mapScene.secondaryMarker}>
            <View style={[styles.marker, styles.endMarker]} />
          </Marker>
        ) : null}
      </GoogleMapView>
      <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        {children}
      </View>
    </View>
  );
}

export function MapTopChip({ label }: { label: string }) {
  return (
    <View style={styles.mapChip}>
      <Animated.Text style={styles.mapChipText}>{label}</Animated.Text>
    </View>
  );
}

export function MapPin({ centered }: { centered?: boolean }) {
  const lift = useSharedValue(0);

  useEffect(() => {
    lift.value = withRepeat(
      withSequence(
        withTiming(-4, {
          duration: 900,
          easing: Easing.inOut(Easing.ease),
        }),
        withTiming(0, {
          duration: 900,
          easing: Easing.inOut(Easing.ease),
        })
      ),
      -1,
      false
    );
  }, [lift]);

  const pinStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: lift.value }],
  }));

  return (
    <>
      <PulseCircle
        color={theme.colors.orange}
        size={30}
        style={centered ? styles.pinPulseCenter : styles.pinPulseLeft}
      />
      <Animated.View style={[centered ? styles.centeredPinWrap : styles.pinWrap, pinStyle]}>
        <View style={styles.pin} />
      </Animated.View>
    </>
  );
}

export function MapRoute() {
  return null;
}

export function MovingVehicle() {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, {
        duration: 4000,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true
    );
  }, [progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * 160 }],
  }));

  return (
    <Animated.View style={[styles.vehicle, animatedStyle]}>
      <Animated.Text style={styles.vehicleEmoji}>🚗</Animated.Text>
    </Animated.View>
  );
}

type PulseCircleProps = {
  size: number;
  color: string;
  style?: object;
  delay?: number;
};

export function PulseCircle({ size, color, style, delay = 0 }: PulseCircleProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, {
          duration: 2000,
          easing: Easing.out(Easing.ease),
        }),
        -1,
        false
      )
    );
  }, [delay, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 0.65 - progress.value * 0.65,
    transform: [{ scale: 1 + progress.value * 1.4 }],
  }));

  return (
    <Animated.View
      style={[
        styles.pulse,
        {
          width: size,
          height: size,
          borderColor: color,
        },
        animatedStyle,
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.mapBase,
    overflow: 'hidden',
    position: 'relative',
  },
  mapChip: {
    backgroundColor: theme.colors.white,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.borderLight,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    ...theme.shadows.card,
  },
  mapChipText: {
    ...theme.typography.monoSmall,
    color: theme.colors.black,
  },
  marker: {
    width: 18,
    height: 18,
    borderRadius: theme.radius.pill,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
  },
  startMarker: {
    backgroundColor: theme.colors.green,
  },
  endMarker: {
    backgroundColor: theme.colors.orange,
  },
  pinWrap: {
    position: 'absolute',
    top: '48%',
    left: '20%',
  },
  centeredPinWrap: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -8,
    marginTop: -22,
  },
  pin: {
    width: 16,
    height: 16,
    backgroundColor: theme.colors.orange,
    borderRadius: 16,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.orange,
    transform: [{ rotate: '45deg' }],
  },
  pulse: {
    position: 'absolute',
    borderWidth: theme.borders.regular,
    borderRadius: theme.radius.pill,
  },
  pinPulseLeft: {
    top: '47%',
    left: '18%',
  },
  pinPulseCenter: {
    top: '49%',
    left: '49%',
  },
  vehicle: {
    position: 'absolute',
    top: '36%',
    left: '18%',
  },
  vehicleEmoji: {
    fontSize: 18,
  },
});
