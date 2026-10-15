import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Linking, Modal, Pressable, StyleSheet, View } from "react-native";
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { AppText } from "@/components/app-text";
import { getAccessTokenWithRetry } from "@/lib/access-token";
import { useAuth } from "@/lib/auth";
import { toUserMessage } from "@/lib/error-messages";
import { useAppLocation } from "@/lib/location";
import {
  cancelSafetyAlert,
  describeAlertKind,
  EMERGENCY_PHONE_NUMBER,
  getActiveSafetyAlert,
  raiseSafetyAlert,
  type SafetyAlert,
  type SafetyAlertKind,
} from "@/lib/safety";
import { theme } from "@/theme";

const KINDS: SafetyAlertKind[] = [
  "SOS",
  "UNSAFE_DRIVING",
  "ROUTE_DEVIATION",
  "ACCIDENT",
  "MEDICAL",
];

/**
 * The emergency button, shared by riders and drivers.
 *
 * Two decisions drive the design:
 *
 *  • **Calling 112 is always one tap, and never blocked.** If our servers are
 *    down, the useful thing this component can do is still get someone to the
 *    police. So the dial option sits at the top of the sheet and does not wait
 *    on any request of ours.
 *  • **Sending is never gated on the network being perfect.** Location is
 *    attached if the device already has a fix and skipped if it does not. An
 *    alert without coordinates still puts a human on the case; an alert that
 *    waited for GPS may never be sent at all.
 */
export function EmergencyButton({
  role,
  rideId,
  interstateDepartureId,
  compact,
}: {
  role: "RIDER" | "DRIVER";
  rideId?: string | null;
  interstateDepartureId?: string | null;
  /** Icon-only, for map overlays where a labelled button would not fit. */
  compact?: boolean;
}) {
  const { getAccessToken } = useAuth();
  const { currentLocation } = useAppLocation();
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [activeAlert, setActiveAlert] = useState<SafetyAlert | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // An alert raised on one screen must still show as live on the next one.
  useEffect(() => {
    void (async () => {
      try {
        const accessToken = await getAccessTokenWithRetry(getAccessToken);
        if (!accessToken) return;
        const result = await getActiveSafetyAlert(accessToken, rideId ?? null);
        if (mountedRef.current) setActiveAlert(result.alert);
      } catch {
        // Not knowing about an older alert is not worth interrupting anyone
        // over — the button still works.
      }
    })();
  }, [getAccessToken, rideId]);

  const send = useCallback(
    async (kind: SafetyAlertKind) => {
      setIsSending(true);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

      try {
        const accessToken = await getAccessTokenWithRetry(getAccessToken);
        if (!accessToken) {
          throw new Error("Please sign in again to send an alert.");
        }

        const result = await raiseSafetyAlert(accessToken, {
          role,
          kind,
          rideId: rideId ?? null,
          interstateDepartureId: interstateDepartureId ?? null,
          lat: currentLocation?.lat ?? null,
          lng: currentLocation?.lng ?? null,
          address: currentLocation?.address ?? null,
        });

        if (!mountedRef.current) return;
        setActiveAlert(result.alert);
        setIsSheetOpen(false);

        Alert.alert(
          "Help is on the way",
          result.alreadyOpen
            ? "Our safety team is already on your alert. Stay on the line if you can."
            : "Our safety team has your location and will contact you. If you are in immediate danger, call 112 now.",
          [
            { text: "Call 112", onPress: () => void dial() },
            { text: "OK", style: "cancel" },
          ],
        );
      } catch (error) {
        Alert.alert(
          "We could not send your alert",
          toUserMessage(
            error,
            "We could not reach our safety team. Call 112 now if you are in danger.",
          ),
          [
            { text: "Call 112", onPress: () => void dial() },
            { text: "Close", style: "cancel" },
          ],
        );
      } finally {
        if (mountedRef.current) setIsSending(false);
      }
    },
    [currentLocation, getAccessToken, interstateDepartureId, rideId, role],
  );

  const cancel = useCallback(async () => {
    if (!activeAlert) return;

    try {
      const accessToken = await getAccessTokenWithRetry(getAccessToken);
      if (!accessToken) return;
      await cancelSafetyAlert(accessToken, activeAlert.id, "False alarm");
      if (mountedRef.current) setActiveAlert(null);
    } catch (error) {
      Alert.alert(
        "Still open",
        toUserMessage(
          error,
          "Our safety team is already handling this alert. They will call you.",
        ),
      );
    }
  }, [activeAlert, getAccessToken]);

  const isLive =
    activeAlert?.status === "OPEN" || activeAlert?.status === "ACKNOWLEDGED";

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isLive ? "Emergency alert is active" : "Emergency"}
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          setIsSheetOpen(true);
        }}
        style={[
          styles.trigger,
          compact ? styles.triggerCompact : null,
          isLive ? styles.triggerLive : null,
        ]}
      >
        {isLive ? <LivePulse /> : null}
        <MaterialIcons
          name={isLive ? "shield" : "sos"}
          size={compact ? 22 : 20}
          color={theme.colors.white}
        />
        {compact ? null : (
          <AppText variant="bodyMedium" color={theme.colors.white}>
            {isLive ? "Alert active" : "Emergency"}
          </AppText>
        )}
      </Pressable>

      <Modal
        visible={isSheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setIsSheetOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setIsSheetOpen(false)} />

        <Animated.View entering={FadeIn.duration(180)} style={styles.sheet}>
          <View style={styles.sheetHandle} />

          <AppText variant="h2">
            {isLive ? "Your alert is active" : "Get help now"}
          </AppText>
          <AppText variant="bodySmall" color={theme.colors.muted}>
            {isLive
              ? "Our safety team has your details and is working on it."
              : "Tell us what is happening. Your location and trip details go with the alert."}
          </AppText>

          {/* Always first, always available — even when everything else fails. */}
          <Pressable
            accessibilityRole="button"
            onPress={() => void dial()}
            style={styles.callRow}
          >
            <View style={styles.callIcon}>
              <MaterialIcons name="call" size={20} color={theme.colors.white} />
            </View>
            <View style={styles.callCopy}>
              <AppText variant="bodyMedium">Call {EMERGENCY_PHONE_NUMBER}</AppText>
              <AppText variant="bodySmall" color={theme.colors.muted}>
                Nigeria&apos;s emergency line — police, fire, ambulance
              </AppText>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={theme.colors.muted} />
          </Pressable>

          {isLive ? (
            <View style={styles.liveBlock}>
              <View style={styles.liveRow}>
                <MaterialIcons
                  name="check-circle"
                  size={18}
                  color={theme.colors.green}
                />
                <AppText variant="bodySmall">
                  {describeAlertKind(activeAlert.kind)} — sent{" "}
                  {timeAgo(activeAlert.createdAt)}
                </AppText>
              </View>

              <Pressable
                accessibilityRole="button"
                onPress={() => void cancel()}
                style={styles.secondaryAction}
              >
                <AppText variant="bodySmall" color={theme.colors.muted}>
                  It was a false alarm — cancel my alert
                </AppText>
              </Pressable>
            </View>
          ) : (
            <View style={styles.kindList}>
              {KINDS.map((kind) => (
                <Pressable
                  key={kind}
                  accessibilityRole="button"
                  disabled={isSending}
                  onPress={() => void send(kind)}
                  style={[
                    styles.kindRow,
                    kind === "SOS" ? styles.kindRowPrimary : null,
                    isSending ? styles.disabled : null,
                  ]}
                >
                  <AppText
                    variant="bodyMedium"
                    color={kind === "SOS" ? theme.colors.white : theme.colors.black}
                  >
                    {describeAlertKind(kind)}
                  </AppText>
                  <MaterialIcons
                    name="arrow-forward"
                    size={18}
                    color={kind === "SOS" ? theme.colors.white : theme.colors.muted}
                  />
                </Pressable>
              ))}
            </View>
          )}

          <Pressable
            accessibilityRole="button"
            onPress={() => setIsSheetOpen(false)}
            style={styles.closeButton}
          >
            <AppText variant="bodyMedium">Close</AppText>
          </Pressable>
        </Animated.View>
      </Modal>
    </>
  );
}

async function dial(): Promise<void> {
  try {
    await Linking.openURL(`tel:${EMERGENCY_PHONE_NUMBER}`);
  } catch {
    Alert.alert(
      "Could not open your dialler",
      `Dial ${EMERGENCY_PHONE_NUMBER} from your phone app.`,
    );
  }
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "just now";

  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.round(minutes / 60)} hr ago`;
}

function LivePulse() {
  const opacity = useSharedValue(0.35);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.85, { duration: 620 }),
        withTiming(0.25, { duration: 620 }),
      ),
      -1,
      false,
    );
  }, [opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return <Animated.View pointerEvents="none" style={[styles.pulse, style]} />;
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.sm,
    height: 48,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.sm,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.danger,
    overflow: "hidden",
    ...theme.shadows.card,
  },
  triggerCompact: {
    width: 48,
    height: 48,
    paddingHorizontal: 0,
    borderRadius: theme.radius.pill,
  },
  triggerLive: { backgroundColor: "#8A1F1F" },
  pulse: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.red,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(13,13,13,0.55)",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    gap: theme.spacing.md,
    padding: theme.spacing.gutter,
    paddingBottom: theme.spacing.xxxl,
    backgroundColor: theme.colors.offWhite,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    borderWidth: theme.borders.thick,
    borderBottomWidth: 0,
    borderColor: theme.colors.borderLight,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 56,
    height: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.mutedLight,
  },
  callRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.danger,
    backgroundColor: theme.colors.dangerLight,
  },
  callIcon: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.danger,
  },
  callCopy: { flex: 1, gap: 2 },
  kindList: { gap: theme.spacing.sm },
  kindRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 52,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.white,
  },
  kindRowPrimary: {
    backgroundColor: theme.colors.danger,
    borderWidth: theme.borders.thick,
  },
  disabled: { opacity: 0.5 },
  liveBlock: { gap: theme.spacing.md },
  liveRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.successLight,
  },
  secondaryAction: { alignItems: "center", paddingVertical: theme.spacing.sm },
  closeButton: {
    alignItems: "center",
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.white,
  },
});
