import { StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useEffect } from "react";

import { AppText, OnLight } from "@/components/app-text";
import { theme } from "@/theme";

type RideMovementBarProps = {
  distanceToNextStopKm?: number;
  totalDistanceKm?: number;
  plannedDistanceKm?: number;
  nextStopAddress?: string;
  isStale?: boolean;
};

export function RideMovementBar({
  distanceToNextStopKm,
  totalDistanceKm,
  plannedDistanceKm,
  nextStopAddress,
  isStale,
}: RideMovementBarProps) {
  const fillProgress = useSharedValue(0);
  const pulseOpacity = useSharedValue(1);

  const progress =
    typeof totalDistanceKm === "number" &&
    Number.isFinite(totalDistanceKm) &&
    typeof plannedDistanceKm === "number" &&
    Number.isFinite(plannedDistanceKm) &&
    plannedDistanceKm > 0
      ? Math.min(1, Math.max(0, totalDistanceKm / plannedDistanceKm))
      : 0;

  useEffect(() => {
    fillProgress.value = withTiming(progress, { duration: 500 });
  }, [fillProgress, progress]);

  useEffect(() => {
    pulseOpacity.value = withRepeat(
      withSequence(
        withTiming(0.35, { duration: 650 }),
        withTiming(1, { duration: 650 }),
      ),
      -1,
      true,
    );
  }, [pulseOpacity]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${fillProgress.value * 100}%`,
  }));

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));

  const title = isStale ? "Driver location paused" : "Trip movement live";
  const body = isStale
    ? "Waiting for the next GPS update."
    : typeof distanceToNextStopKm === "number" && Number.isFinite(distanceToNextStopKm)
      ? `${distanceToNextStopKm.toFixed(1)} km to ${nextStopAddress ?? "the next stop"}`
      : "Live distance updates will appear here.";

  return (
    <View style={styles.card}>
      <OnLight>
      <View style={styles.row}>
        <Animated.View style={[styles.pulseDot, pulseStyle]} />
        <View style={styles.copy}>
          <AppText variant="monoSmall" color={theme.colors.black}>
            {title}
          </AppText>
          <AppText variant="bodySmall" color={theme.colors.muted}>
            {body}
          </AppText>
        </View>
      </View>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, fillStyle]} />
      </View>
      </OnLight>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.orangeLight,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.borderLight,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.sm,
    ...theme.shadows.card,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  pulseDot: {
    width: 10,
    height: 10,
    borderRadius: theme.radius.pill,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.orange,
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  track: {
    height: 10,
    borderRadius: theme.radius.pill,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.black,
    backgroundColor: "rgba(13,13,13,0.08)",
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.green,
  },
});
