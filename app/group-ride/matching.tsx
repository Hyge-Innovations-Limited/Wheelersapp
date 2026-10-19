import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { AppScreen } from "@/components/app-screen";
import { AppText, OnLight } from "@/components/app-text";
import {
  cancelGroupRideMatchRequest,
  completeGroupRideFaceUpload,
  createGroupRideFaceUploadUrl,
  createGroupRideMatchRequest,
  getGroupRideMatchRequest,
  uploadGroupRideFaceImage,
  type GroupRideGenderPreference,
  type GroupRideMatchRequest,
} from "@/lib/api";
import { getAccessTokenWithRetry } from "@/lib/access-token";
import { useAuth } from "@/lib/auth";
import { getGroupRideFaceCapture } from "@/lib/group-ride-draft";
import { resolvePlaceQuery } from "@/lib/google-places";
import { useAppLocation } from "@/lib/location";
import { isCurrentLocationLabel } from "@/lib/ride-route";
import { theme } from "@/theme";

function getStageForStatus(status: GroupRideMatchRequest["status"] | null): number {
  if (!status) return 0;
  switch (status) {
    case "PENDING_FACE_UPLOAD":
    case "READY_FOR_MATCH":
      return 0;
    case "MATCHING":
      return 2;
    case "GROUPED":
      return 3;
    case "BOOKED":
      return 3;
    default:
      return 0;
  }
}

const matchStages = [
  { heading: "Verifying rider", body: "Securing your request before matching starts." },
  { heading: "Preparing match", body: "Your route is queued for shared-ride matching." },
  { heading: "Finding riders", body: "Matching riders heading the same way." },
  { heading: "Riders found", body: "Building your shared route." },
] as const;

export default function GroupRideMatchingScreen() {
  const router = useRouter();
  const { getAccessToken } = useAuth();
  const { currentLocation } = useAppLocation();
  const params = useLocalSearchParams<{
    pickup?: string;
    destination?: string;
    genderPreference?: string;
    requestId?: string;
  }>();
  const genderPreference = normalizeGenderPreference(params.genderPreference);
  const [stageIndex, setStageIndex] = useState(0);
  const [requestId, setRequestId] = useState<string | null>(
    typeof params.requestId === "string" ? params.requestId : null,
  );
  const [failure, setFailure] = useState<string | null>(null);
  const autoNavigatedRef = useRef(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const creatingRef = useRef(false);

  // Pulse rings
  const ring1 = useSharedValue(0);
  const ring2 = useSharedValue(0);
  const ring3 = useSharedValue(0);
  const centerScale = useSharedValue(1);
  const rotation = useSharedValue(0);
  const dot1Y = useSharedValue(0);
  const dot2Y = useSharedValue(0);
  const dot3Y = useSharedValue(0);

  useEffect(() => {
    const ringConfig = { duration: 2200, easing: Easing.out(Easing.cubic) };

    ring1.value = withRepeat(
      withSequence(withTiming(0, { duration: 0 }), withTiming(1, ringConfig)),
      -1,
      false,
    );
    ring2.value = withDelay(
      600,
      withRepeat(
        withSequence(withTiming(0, { duration: 0 }), withTiming(1, ringConfig)),
        -1,
        false,
      ),
    );
    ring3.value = withDelay(
      1200,
      withRepeat(
        withSequence(withTiming(0, { duration: 0 }), withTiming(1, ringConfig)),
        -1,
        false,
      ),
    );

    centerScale.value = withRepeat(
      withSequence(
        withTiming(1.12, { duration: 700, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      true,
    );

    rotation.value = withRepeat(
      withTiming(360, { duration: 3000, easing: Easing.linear }),
      -1,
      false,
    );

    const floatConfig = { duration: 1800, easing: Easing.inOut(Easing.quad) };
    dot1Y.value = withRepeat(
      withSequence(withTiming(-8, floatConfig), withTiming(0, floatConfig)),
      -1,
      true,
    );
    dot2Y.value = withDelay(
      400,
      withRepeat(
        withSequence(withTiming(-8, floatConfig), withTiming(0, floatConfig)),
        -1,
        true,
      ),
    );
    dot3Y.value = withDelay(
      800,
      withRepeat(
        withSequence(withTiming(-8, floatConfig), withTiming(0, floatConfig)),
        -1,
        true,
      ),
    );
  }, [centerScale, dot1Y, dot2Y, dot3Y, ring1, ring2, ring3, rotation]);

  // Create match request on mount, then hand over the verification selfie.
  useEffect(() => {
    if (requestId || creatingRef.current) return;
    creatingRef.current = true;

    void (async () => {
      try {
        const accessToken = await getAccessTokenWithRetry(getAccessToken);
        if (!accessToken) {
          setFailure("You need to be signed in to book a group ride.");
          return;
        }

        const pickupLabel = params.pickup ?? "";
        const destinationLabel = params.destination ?? "";

        // These used to be sent as lat 0, lng 0 — a point in the Atlantic off
        // Ghana. Matching is distance-based, so every request landed in the
        // same imaginary place and nobody could ever be "nearby".
        const pickup =
          isCurrentLocationLabel(pickupLabel) && currentLocation
            ? currentLocation
            : await resolvePlaceQuery(pickupLabel);
        const destination = await resolvePlaceQuery(destinationLabel);

        const result = await createGroupRideMatchRequest({
          accessToken,
          pickup,
          destination,
          genderPreference,
          paymentMethod: "wallet_balance",
        });

        setRequestId(result.item.id);
        setStageIndex(getStageForStatus(result.item.status));

        await uploadFaceVerification(accessToken, result.item.id);
      } catch (error) {
        setFailure(
          error instanceof Error
            ? error.message
            : "Could not start matching for this group ride.",
        );
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId, getAccessToken, params.pickup, params.destination, genderPreference]);

  /**
   * Send the selfie taken on the face-verify screen, then ask the backend to
   * complete it. The completion call is what runs the vision check and moves
   * the request to READY_FOR_MATCH — without it the rider sits at
   * PENDING_FACE_UPLOAD forever, which is exactly what used to happen.
   */
  const uploadFaceVerification = useCallback(
    async (accessToken: string, matchRequestId: string) => {
      const capture = getGroupRideFaceCapture();
      if (!capture) {
        setFailure("Take your verification photo before matching starts.");
        return;
      }

      try {
        const { upload } = await createGroupRideFaceUploadUrl({
          accessToken,
          requestId: matchRequestId,
          mimeType: capture.mimeType,
          capturedAt: capture.capturedAt,
        });

        await uploadGroupRideFaceImage({
          uploadUrl: upload.uploadUrl,
          uri: capture.uri,
          mimeType: capture.mimeType,
        });

        const completed = await completeGroupRideFaceUpload({
          accessToken,
          requestId: matchRequestId,
          capturedAt: capture.capturedAt,
        });

        setStageIndex(getStageForStatus(completed.item.status));
      } catch (error) {
        // A rejected selfie comes back from the vision check here. Send the
        // rider back to the camera rather than leaving them on a spinner that
        // will never resolve.
        setFailure(
          error instanceof Error
            ? error.message
            : "Your verification photo could not be accepted.",
        );
      }
    },
    [],
  );

  // Poll for status updates
  const pollStatus = useCallback(async () => {
    if (!requestId || autoNavigatedRef.current) return;

    try {
      const accessToken = await getAccessTokenWithRetry(getAccessToken);
      if (!accessToken) return;

      const result = await getGroupRideMatchRequest({
        accessToken,
        requestId,
      });

      const status = result.item.status;
      setStageIndex(getStageForStatus(status));

      if (status === "GROUPED" || status === "BOOKED") {
        if (autoNavigatedRef.current) return;
        autoNavigatedRef.current = true;

        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        router.replace({
          pathname: "/group-ride/ride-selection",
          params: {
            requestId,
            pickup: params.pickup ?? "",
            destination: params.destination ?? "",
            genderPreference,
          },
        });
      } else if (status === "EXPIRED" || status === "CANCELLED") {
        if (autoNavigatedRef.current) return;
        autoNavigatedRef.current = true;
        router.replace("/rider");
      }
    } catch {
      // Non-blocking — retry on next tick
    }
  }, [requestId, getAccessToken, params.pickup, params.destination, genderPreference, router]);

  useEffect(() => {
    if (!requestId) return;

    // Initial poll
    void pollStatus();

    pollingRef.current = setInterval(pollStatus, 3000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [requestId, pollStatus]);

  const handleCancel = async () => {
    if (pollingRef.current) clearInterval(pollingRef.current);

    if (requestId) {
      try {
        const accessToken = await getAccessTokenWithRetry(getAccessToken);
        if (accessToken) {
          await cancelGroupRideMatchRequest({
            accessToken,
            requestId,
            reason: "rider_cancelled",
          });
        }
      } catch {
        // Best-effort cancel
      }
    }

    router.replace("/rider");
  };

  const ring1Style = useAnimatedStyle(() => ({
    opacity: 1 - ring1.value,
    transform: [{ scale: 0.5 + ring1.value * 1.4 }],
  }));
  const ring2Style = useAnimatedStyle(() => ({
    opacity: 1 - ring2.value,
    transform: [{ scale: 0.5 + ring2.value * 1.4 }],
  }));
  const ring3Style = useAnimatedStyle(() => ({
    opacity: 1 - ring3.value,
    transform: [{ scale: 0.5 + ring3.value * 1.4 }],
  }));
  const centerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: centerScale.value }],
  }));
  const rotationStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));
  const dot1Style = useAnimatedStyle(() => ({
    transform: [{ translateY: dot1Y.value }],
  }));
  const dot2Style = useAnimatedStyle(() => ({
    transform: [{ translateY: dot2Y.value }],
  }));
  const dot3Style = useAnimatedStyle(() => ({
    transform: [{ translateY: dot3Y.value }],
  }));

  const stage = matchStages[stageIndex];

  return (
    <AppScreen
      backgroundColor={theme.colors.black}
      scroll
      contentStyle={styles.container}
      safeAreaEdges={["top", "left", "right", "bottom"]}
    >
      <StatusBar style="light" />

      {/* Route pill at top */}
      <Animated.View entering={FadeInDown.delay(100).duration(500)} style={styles.routePill}>
        <View style={styles.routePillDot} />
        <AppText variant="bodySmall" color={theme.colors.offWhite} numberOfLines={1} style={styles.routePillText}>
          {params.destination ?? "Your destination"}
        </AppText>
      </Animated.View>

      {/* Radar animation */}
      <View style={styles.radarWrap}>
        <Animated.View style={[styles.ring, styles.ring1, ring1Style]} />
        <Animated.View style={[styles.ring, styles.ring2, ring2Style]} />
        <Animated.View style={[styles.ring, styles.ring3, ring3Style]} />

        <Animated.View style={[styles.sweepArm, rotationStyle]} pointerEvents="none">
          <View style={styles.sweepLine} />
          <View style={styles.sweepDot} />
        </Animated.View>

        <Animated.View style={[styles.centerWrap, centerStyle]}>
          <View style={styles.centerDot}>
            <MaterialIcons name="group" size={28} color={theme.colors.black} />
          </View>
        </Animated.View>

        <Animated.View style={[styles.floatDot, styles.floatDot1, dot1Style]}>
          <MaterialIcons name="person-pin" size={20} color={theme.colors.orange} />
        </Animated.View>
        <Animated.View style={[styles.floatDot, styles.floatDot2, dot2Style]}>
          <MaterialIcons name="person-pin" size={16} color={theme.colors.green} />
        </Animated.View>
        <Animated.View style={[styles.floatDot, styles.floatDot3, dot3Style]}>
          <MaterialIcons name="person-pin" size={18} color={theme.colors.orange} />
        </Animated.View>
      </View>

      {/* Status text */}
      <Animated.View entering={FadeIn.delay(300).duration(600)} style={styles.statusWrap}>
        <AppText variant="h1" color={theme.colors.offWhite} style={styles.heading}>
          {stage.heading}
        </AppText>
        <View style={styles.dotsRow}>
          <Animated.View style={[styles.pingDot, dot1Style]} />
          <Animated.View style={[styles.pingDot, dot2Style]} />
          <Animated.View style={[styles.pingDot, dot3Style]} />
        </View>
        <AppText variant="bodySmall" color={theme.colors.muted} style={styles.subText}>
          {stage.body}
        </AppText>
      </Animated.View>

      {/* Info card */}
      <Animated.View entering={FadeInDown.delay(500).duration(500)} style={styles.infoCard}>
        <View style={styles.infoHeader}>
          <View style={styles.infoIcon}>
            <MaterialIcons name="groups" size={18} color={theme.colors.black} />
          </View>
          <View style={styles.infoCopy}>
            <AppText variant="bodyMedium" color={theme.colors.offWhite}>
              Group ride matching
            </AppText>
            <AppText variant="bodySmall" color={theme.colors.muted}>
              Any verified rider
            </AppText>
          </View>
        </View>
      </Animated.View>

      {/* Something stopped this request before matching could start */}
      {failure ? (
        <Animated.View entering={FadeIn.duration(300)} style={styles.failureCard}>
          <MaterialIcons name="error-outline" size={20} color={theme.colors.danger} />
          <AppText variant="bodySmall" color={theme.colors.offWhite} style={styles.failureText}>
            {failure}
          </AppText>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace("/group-ride/face-verify")}
            style={styles.failureAction}
          >
            <OnLight>
            <AppText variant="bodySmall" color={theme.colors.black}>
              Retake photo
            </AppText>
            </OnLight>
          </Pressable>
        </Animated.View>
      ) : null}

      {/* Cancel */}
      <Pressable
        accessibilityRole="button"
        onPress={handleCancel}
        style={styles.cancelButton}
      >
        <AppText variant="bodyMedium" color={theme.colors.muted}>
          Cancel
        </AppText>
      </Pressable>
    </AppScreen>
  );
}

function normalizeGenderPreference(
  value: string | string[] | undefined,
): GroupRideGenderPreference {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "women_only" || raw === "men_only" || raw === "any") {
    return raw;
  }

  return "any";
}

const RADAR_SIZE = 220;

const styles = StyleSheet.create({
  failureCard: {
    alignItems: "center",
    gap: theme.spacing.sm,
    padding: theme.spacing.lg,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.danger,
    backgroundColor: "rgba(204,51,51,0.12)",
    maxWidth: 340,
  },
  failureText: {
    textAlign: "center",
  },
  failureAction: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.offWhite,
  },
  container: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.xl,
    paddingHorizontal: theme.spacing.gutter,
    paddingBottom: theme.spacing.xxl,
  },
  routePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderWidth: theme.borders.regular,
    borderColor: "rgba(255,255,255,0.15)",
    borderRadius: theme.radius.pill,
    backgroundColor: "rgba(255,255,255,0.06)",
    maxWidth: 280,
  },
  routePillDot: {
    width: 6,
    height: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.orange,
    flexShrink: 0,
  },
  routePillText: {
    flex: 1,
  },
  radarWrap: {
    width: RADAR_SIZE,
    height: RADAR_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    position: "absolute",
    width: RADAR_SIZE,
    height: RADAR_SIZE,
    borderRadius: RADAR_SIZE / 2,
    borderWidth: 1.5,
  },
  ring1: {
    borderColor: theme.colors.orange,
  },
  ring2: {
    borderColor: theme.colors.orange,
    opacity: 0.7,
  },
  ring3: {
    borderColor: theme.colors.orange,
    opacity: 0.4,
  },
  sweepArm: {
    position: "absolute",
    width: RADAR_SIZE / 2,
    height: 2,
    left: RADAR_SIZE / 2,
    top: RADAR_SIZE / 2 - 1,
    transformOrigin: "0% 50%",
    alignItems: "flex-end",
    justifyContent: "center",
  },
  sweepLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: theme.colors.orange,
    opacity: 0.5,
  },
  sweepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.orange,
    marginRight: -4,
  },
  centerWrap: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: theme.colors.orange,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  centerDot: {
    alignItems: "center",
    justifyContent: "center",
  },
  floatDot: {
    position: "absolute",
  },
  floatDot1: {
    top: 30,
    right: 40,
  },
  floatDot2: {
    bottom: 44,
    left: 36,
  },
  floatDot3: {
    bottom: 30,
    right: 30,
  },
  statusWrap: {
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  heading: {
    textAlign: "center",
  },
  dotsRow: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    alignItems: "center",
  },
  pingDot: {
    width: 7,
    height: 7,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.orange,
  },
  subText: {
    textAlign: "center",
  },
  infoCard: {
    width: "100%",
    borderWidth: theme.borders.thick,
    borderColor: "rgba(255,255,255,0.14)",
    borderRadius: theme.radius.lg,
    backgroundColor: "rgba(255,132,67,0.12)",
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  infoHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  infoIcon: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.orange,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  infoCopy: {
    flex: 1,
    gap: 2,
  },
  cancelButton: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
  },
});
