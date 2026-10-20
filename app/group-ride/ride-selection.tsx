import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { AppButton } from "@/components/app-button";
import { AppScreen } from "@/components/app-screen";
import { AppText, OnLight } from "@/components/app-text";
import { BackArrow } from "@/components/back-arrow";
import { LiveMap } from "@/components/live-map";
import { FloatingView } from "@/components/motion";
import {
  getGroupRideMatchRequest,
  type GroupRideGenderPreference,
  type GroupRideMatchRequest,
  type GroupRideMatchedRider,
} from "@/lib/api";
import { getAccessTokenWithRetry } from "@/lib/access-token";
import { useAuth } from "@/lib/auth";
import { theme } from "@/theme";
import { useGoHome } from "@/hooks/use-go-home";

function formatMinutes(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "--";
  }

  return String(Math.max(1, Math.ceil(value / 60)));
}

function getDisplayName(rider: GroupRideMatchedRider): string {
  const primary = rider.name?.trim() || rider.username?.trim();
  if (primary) {
    return primary;
  }

  return `Rider ${rider.userId.slice(0, 4).toUpperCase()}`;
}

function getInitials(value: string): string {
  const parts = value
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return "RD";
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export default function GroupRideSelectionScreen() {
  const router = useRouter();
  const goHome = useGoHome();
  const { getAccessToken } = useAuth();
  const { height } = useWindowDimensions();
  const params = useLocalSearchParams<{
    requestId?: string | string[];
    pickup?: string | string[];
    destination?: string | string[];
    genderPreference?: string | string[];
  }>();

  const requestId = Array.isArray(params.requestId)
    ? params.requestId[0]
    : params.requestId;

  const [loading, setLoading] = useState(true);
  const [request, setRequest] = useState<GroupRideMatchRequest | null>(null);
  const [matchedRiders, setMatchedRiders] = useState<GroupRideMatchedRider[]>([]);

  // Fetch real group ride data
  useEffect(() => {
    if (!requestId) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const accessToken = await getAccessTokenWithRetry(getAccessToken);
        if (!accessToken || cancelled) return;

        const result = await getGroupRideMatchRequest({
          accessToken,
          requestId,
        });

        if (!cancelled) {
          setRequest(result.item);
          setMatchedRiders(result.matchedRiders);
        }
      } catch {
        // Non-blocking — show whatever we have
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [requestId, getAccessToken]);

  const displayRequest = request;
  const displayMatchedRiders = matchedRiders;

  const SHEET_MIN_HEIGHT = Math.min(430, Math.max(340, Math.floor(height * 0.48)));
  const SHEET_MAX_HEIGHT = Math.min(Math.max(400, Math.floor(height * 0.66)), height - 76);
  const collapsedSheetOffset = Math.min(220, Math.max(128, SHEET_MIN_HEIGHT - 300));
  const sheetOffset = useSharedValue(0);

  const routeFitPadding = {
    top: 88,
    right: 56,
    bottom: SHEET_MIN_HEIGHT + 56,
    left: 56,
  };

  const expandSheet = () => {
    sheetOffset.value = withTiming(0, { duration: 220 });
  };

  const collapseSheet = () => {
    sheetOffset.value = withTiming(collapsedSheetOffset, { duration: 220 });
  };

  const sheetPanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) =>
        Math.abs(gestureState.dy) > 10 &&
        Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy < -30) {
          expandSheet();
          return;
        }
        if (gestureState.dy > 30) collapseSheet();
      },
      onPanResponderTerminate: (_, gestureState) => {
        if (gestureState.dy < -30) {
          expandSheet();
          return;
        }
        if (gestureState.dy > 30) collapseSheet();
      },
    }),
  ).current;

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetOffset.value }],
  }));

  if (loading) {
    return (
      <AppScreen
        backgroundColor={theme.colors.mapBase}
        contentStyle={styles.loadingContainer}
      >
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color={theme.colors.orange} />
        <AppText variant="bodyMedium" color={theme.colors.muted}>
          Loading group ride...
        </AppText>
      </AppScreen>
    );
  }

  if (!displayRequest) {
    return (
      <AppScreen
        backgroundColor={theme.colors.offWhite}
        contentStyle={styles.loadingContainer}
      >
        <StatusBar style="dark" />
        <AppText variant="h3">Group ride not found</AppText>
        <AppText variant="bodySmall" color={theme.colors.muted}>
          The group ride request could not be loaded.
        </AppText>
        <AppButton title="Back to Home" onPress={() => goHome()} />
      </AppScreen>
    );
  }

  return (
    <AppScreen
      backgroundColor={theme.colors.mapBase}
      contentStyle={styles.container}
      safeAreaEdges={["top", "left", "right"]}
    >
      <StatusBar style="dark" backgroundColor={theme.colors.mapBase} />

      <View style={styles.mapWrap}>
        <LiveMap
          height={height}
          pickup={displayRequest.pickup}
          destination={displayRequest.destination}
          stops={displayRequest.stops}
          initialCenter={displayRequest.pickup}
          fitPadding={routeFitPadding}
        >
          <View style={styles.topBar}>
            <BackArrow onPress={() => router.back()} />
            <FloatingView distance={5}>
              <View style={styles.mapChip}>
                <OnLight>
                <AppText variant="monoSmall">
                  Group • {formatMinutes(displayRequest.plannedDurationSeconds)} min trip
                </AppText>
                </OnLight>
              </View>
            </FloatingView>
          </View>

          <Animated.View
            entering={FadeInDown.delay(300).duration(400)}
            style={[styles.matchedPill, { bottom: SHEET_MIN_HEIGHT - 180 }]}
          >
            <View style={styles.matchedAvatarRow}>
              {displayMatchedRiders.map((rider, index) => (
                <View
                  key={rider.userId}
                  style={[styles.avatar, index > 0 ? styles.avatarOverlap : null]}
                >
                  <OnLight>
                  <AppText
                    variant="monoSmall"
                    color={theme.colors.black}
                    style={styles.avatarText}
                  >
                    {getInitials(getDisplayName(rider))}
                  </AppText>
                  </OnLight>
                </View>
              ))}
              <View style={[styles.avatar, styles.avatarYou]}>
                <OnLight>
                <AppText
                  variant="monoSmall"
                  color={theme.colors.offWhite}
                  style={styles.avatarText}
                >
                  YOU
                </AppText>
                </OnLight>
              </View>
            </View>
            <AppText variant="bodySmall" color={theme.colors.black}>
              {displayMatchedRiders.length + 1} riders in group
            </AppText>
          </Animated.View>
        </LiveMap>
      </View>

      {/* Bottom sheet */}
      <Animated.View
        style={[
          styles.sheet,
          { minHeight: SHEET_MIN_HEIGHT, maxHeight: SHEET_MAX_HEIGHT },
          sheetAnimatedStyle,
        ]}
        {...sheetPanResponder.panHandlers}
      >
        <OnLight>
        <Pressable onPress={expandSheet} style={styles.handleArea}>
          <View style={styles.handle} />
        </Pressable>

        <ScrollView
          bounces={false}
          contentContainerStyle={styles.sheetContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.sheetHeader}>
            <View style={styles.sheetHeaderCopy}>
              <AppText variant="monoSmall" color={theme.colors.orange}>
                GROUP RIDE
              </AppText>
              <AppText variant="h1">Wheeler Group</AppText>
              <AppText variant="bodySmall" color={theme.colors.muted}>
                {displayMatchedRiders.length + 1} riders • {formatMinutes(displayRequest.plannedDurationSeconds)} min away
              </AppText>
            </View>
            <View style={styles.rideIcon}>
              <OnLight>
              <AppText style={styles.rideEmoji}>🛵</AppText>
              </OnLight>
            </View>
          </View>

          <Pressable onPress={expandSheet} style={styles.groupCard}>
            <View style={styles.groupTopRow}>
              <View style={styles.matchedAvatarRow}>
                {displayMatchedRiders.slice(0, 3).map((rider, index) => (
                  <View
                    key={rider.userId}
                    style={[styles.avatar, index > 0 ? styles.avatarOverlap : null]}
                  >
                    <OnLight>
                    <AppText variant="monoSmall" color={theme.colors.black} style={styles.avatarText}>
                      {getInitials(getDisplayName(rider))}
                    </AppText>
                    </OnLight>
                  </View>
                ))}
                <View style={[styles.avatar, styles.avatarYou]}>
                  <OnLight>
                  <AppText variant="monoSmall" color={theme.colors.offWhite} style={styles.avatarText}>
                    YOU
                  </AppText>
                  </OnLight>
                </View>
              </View>
              <View style={styles.priceBlock}>
                <AppText variant="monoSmall" color="rgba(255,255,255,0.65)">
                  NGN
                </AppText>
                <AppText variant="h2" color={theme.colors.offWhite}>
                  {typeof displayRequest.fareEstimateNgn === "number"
                    ? Math.round(displayRequest.fareEstimateNgn).toLocaleString("en-NG")
                    : "--"}
                </AppText>
              </View>
            </View>

            <View style={styles.tripMetaRow}>
              <View style={styles.tripMetaPill}>
                <OnLight>
                <AppText variant="monoSmall" color={theme.colors.black}>
                  {formatMinutes(displayRequest.plannedDurationSeconds)} MIN
                </AppText>
                </OnLight>
              </View>
              <View style={styles.tripMetaPill}>
                <OnLight>
                <AppText variant="monoSmall" color={theme.colors.black}>
                  {displayRequest.plannedDistanceKm?.toFixed(1) ?? "--"} KM
                </AppText>
                </OnLight>
              </View>
              <View style={styles.tripMetaPill}>
                <OnLight>
                <AppText variant="monoSmall" color={theme.colors.black}>
                  SPLIT FARE
                </AppText>
                </OnLight>
              </View>
            </View>
          </Pressable>

          <View style={styles.pickupCard}>
            <OnLight>
            <View style={styles.routeLineRow}>
              <View style={styles.pickupDot} />
              <View style={styles.routeLineCopy}>
                <AppText variant="monoSmall" color={theme.colors.muted}>
                  PICKUP
                </AppText>
                <AppText variant="bodyMedium" numberOfLines={2}>
                  {displayRequest.pickup.address}
                </AppText>
              </View>
            </View>
            <View style={styles.routeLineDivider} />
            <View style={styles.routeLineRow}>
              <View style={styles.destinationDot} />
              <View style={styles.routeLineCopy}>
                <AppText variant="monoSmall" color={theme.colors.muted}>
                  DROP-OFF
                </AppText>
                <AppText variant="bodyMedium" numberOfLines={2}>
                  {displayRequest.destination.address}
                </AppText>
              </View>
            </View>
            </OnLight>
          </View>

          <AppButton
            title="Back to Home"
            onPress={() => goHome()}
          />
        </ScrollView>
        </OnLight>
      </Animated.View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 0,
    paddingBottom: 0,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.md,
  },
  mapWrap: {
    flex: 1,
  },
  topBar: {
    position: "absolute",
    top: 16,
    left: theme.spacing.gutter,
    right: theme.spacing.gutter,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  mapChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.white,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    ...theme.shadows.card,
  },
  matchedPill: {
    position: "absolute",
    right: theme.spacing.gutter,
    bottom: 320,
    backgroundColor: theme.colors.orange,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.xs,
    alignItems: "center",
    ...theme.shadows.card,
  },
  matchedAvatarRow: {
    flexDirection: "row",
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.offWhite,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.black,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarOverlap: {
    marginLeft: -10,
  },
  avatarYou: {
    backgroundColor: theme.colors.black,
  },
  avatarText: {
    fontSize: 10,
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colors.offWhite,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    borderWidth: theme.borders.thick,
    borderBottomWidth: 0,
    borderColor: theme.colors.black,
    paddingHorizontal: theme.spacing.gutter,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.xl,
  },
  sheetContent: {
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
  },
  handleArea: {
    alignItems: "center",
    paddingVertical: theme.spacing.xs,
  },
  handle: {
    width: 56,
    height: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.borderLight,
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sheetHeaderCopy: {
    flex: 1,
    gap: 3,
  },
  rideIcon: {
    width: 62,
    height: 62,
    borderRadius: theme.radius.pill,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.orangeLight,
    alignItems: "center",
    justifyContent: "center",
    ...theme.shadows.card,
  },
  rideEmoji: {
    fontSize: 28,
  },
  groupCard: {
    backgroundColor: theme.colors.orange,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.md,
    ...theme.shadows.card,
  },
  groupTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.md,
  },
  priceBlock: {
    minWidth: 104,
    maxWidth: 132,
    alignSelf: "stretch",
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.black,
    borderRadius: theme.radius.md,
    backgroundColor: "rgba(13,13,13,0.18)",
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  tripMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
  },
  tripMetaPill: {
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.black,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.white,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 5,
  },
  pickupCard: {
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.white,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    ...theme.shadows.card,
  },
  routeLineRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing.sm,
  },
  pickupDot: {
    width: 12,
    height: 12,
    borderRadius: theme.radius.pill,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.orange,
    marginTop: 3,
  },
  destinationDot: {
    width: 12,
    height: 12,
    borderRadius: 4,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.green,
    marginTop: 3,
  },
  routeLineCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  routeLineDivider: {
    height: 1,
    backgroundColor: theme.colors.borderLight,
    marginLeft: 24,
  },
});
