import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { RBack, RButton, RScreen, RText, rider } from "@/components/rider/kit";
import { toUserMessage } from "@/lib/error-messages";
import { estimateEtaMinutes } from "@/lib/geo";
import { useRideSession } from "@/lib/ride-session";

const { colors } = rider;

const REASONS = [
  "Long waiting time",
  "Wrong pickup or destination",
  "Driver is not moving",
  "Driver asked me to cancel",
  "My plans changed",
  "Other reason",
] as const;

/** "Cancel this ride?": one reason, then cancel. Used while searching and once a driver is confirmed. */
export default function RiderCancelScreen() {
  const router = useRouter();
  const { cancelRide, currentRide, clearRide } = useRideSession();
  const [reason, setReason] = useState<(typeof REASONS)[number]>(REASONS[0]);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const leavingRef = useRef(false);

  const status = currentRide?.status;
  const gone = !currentRide || status === "cancelled" || status === "idle";

  // Nothing left to cancel (it ended, or was cancelled from the other side).
  useEffect(() => {
    if (leavingRef.current) return;
    if (gone) {
      leavingRef.current = true;
      router.replace("/rider");
    } else if (status === "completed") {
      leavingRef.current = true;
      router.replace("/rider/trip-rating");
    }
  }, [gone, router, status]);

  // How far the driver is, only while they are on the way and we know.
  const liveKm = currentRide?.driverLocation?.distanceToNextStopKm;
  const etaMinutes =
    status !== "matched"
      ? null
      : typeof liveKm === "number" && Number.isFinite(liveKm)
        ? estimateEtaMinutes(liveKm)
        : currentRide?.driver?.etaSeconds
          ? Math.max(1, Math.ceil(currentRide.driver.etaSeconds / 60))
          : null;

  function keepRide() {
    if (router.canGoBack()) router.back();
    else router.replace("/rider");
  }

  async function confirm() {
    if (cancelling) return;
    setCancelling(true);
    setError(null);
    // This screen does the leaving: the watcher above must not also do it.
    leavingRef.current = true;
    try {
      await cancelRide(reason);
      // Put the cancelled ride away so the next booking starts clean.
      clearRide();
      router.replace("/rider");
    } catch (failure) {
      leavingRef.current = false;
      setError(toUserMessage(failure, "We could not cancel the ride. Check your connection and try again."));
      setCancelling(false);
    }
  }

  return (
    <RScreen contentStyle={styles.container} scroll>
      <StatusBar style="dark" />
      <RBack onPress={keepRide} />

      <View style={styles.head}>
        <RText accessibilityRole="header" variant="display" style={styles.title}>
          Cancel this ride?
        </RText>
        {etaMinutes ? (
          <RText color={colors.muted}>
            Your driver is {etaMinutes} {etaMinutes === 1 ? "minute" : "minutes"} away.
          </RText>
        ) : null}
      </View>

      <View accessibilityRole="radiogroup" style={styles.reasons}>
        <RText variant="label">WHY ARE YOU CANCELLING?</RText>
        {REASONS.map((item) => {
          const chosen = item === reason;
          return (
            <Pressable
              accessibilityLabel={item}
              accessibilityRole="radio"
              accessibilityState={{ checked: chosen, disabled: cancelling }}
              disabled={cancelling}
              key={item}
              onPress={() => setReason(item)}
              style={({ pressed }) => [styles.reason, chosen ? styles.reasonOn : null, pressed ? styles.pressed : null]}>
              <Ionicons
                color={chosen ? colors.ink : colors.muted}
                name={chosen ? "radio-button-on" : "radio-button-off"}
                size={24}
              />
              <RText style={styles.reasonText}>{item}</RText>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.note}>
        <RText variant="small">Cancelling is free. You will not be charged.</RText>
      </View>

      {error ? (
        <RText accessibilityLiveRegion="polite" color={colors.danger} variant="smallBold">
          {error}
        </RText>
      ) : null}

      <View style={styles.spacer} />

      <RButton disabled={cancelling} onPress={keepRide} title="Keep ride" />
      <RButton
        loading={cancelling}
        onPress={() => void confirm()}
        size="md"
        title="Cancel ride"
        variant="danger"
      />
    </RScreen>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, paddingHorizontal: rider.gutter, paddingTop: 12, paddingBottom: 24, gap: 14 },
  pressed: { opacity: 0.72 },
  head: { gap: 8 },
  title: { fontSize: 34, lineHeight: 37 },
  reasons: { gap: 8 },
  reason: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 54,
    paddingHorizontal: 16,
    borderRadius: rider.radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  reasonOn: { borderColor: colors.ink },
  reasonText: { flex: 1, fontFamily: rider.fonts.semibold, fontSize: 16, lineHeight: 22 },
  note: { paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, backgroundColor: colors.orangeSoft },
  spacer: { flexGrow: 1, minHeight: 4 },
});
