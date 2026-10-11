import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmergencyButton } from "@/components/emergency-button";
import { LiveMap } from "@/components/live-map";
import { RAvatar, RBack, RLink, RText, naira, rider } from "@/components/rider/kit";
import { useCallDriver } from "@/components/rider/use-call-driver";
import { estimateEtaMinutes } from "@/lib/geo";
import { useAppLocation } from "@/lib/location";
import {
  getAdditionalStopCount,
  parseRideItineraryParam,
  serializeRideItinerary,
} from "@/lib/ride-route";
import { useRideSession } from "@/lib/ride-session";
import { isTripChatOpen, useTripChatOpenRequests, useTripChatUnread } from "@/lib/trip-chat";

const { colors, fonts } = rider;

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** "Adeola Odeku Street, Victoria Island, Lagos" → "Adeola Odeku Street". */
function shortPlace(address: string | null | undefined): string {
  return (address ?? "").split(",")[0]?.trim() ?? "";
}

/** The trip from the moment a driver is confirmed until it ends: driver on the way, then the ride itself. */
export default function RiderActiveTripScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const isFocused = useIsFocused();
  const { backgroundGranted, requestBackgroundLocationAccess } = useAppLocation();
  const params = useLocalSearchParams<{
    itinerary?: string | string[];
  }>();
  const fallbackItinerary = useMemo(
    () => parseRideItineraryParam(params.itinerary),
    [params.itinerary],
  );
  const { currentRide, chatMessages } = useRideSession();
  const itinerary = currentRide?.itinerary ?? fallbackItinerary;
  const extraStops = getAdditionalStopCount(itinerary);
  const serializedItinerary = serializeRideItinerary(itinerary);
  const backgroundPromptedRef = useRef(false);

  const rideId = currentRide?.rideId ?? null;
  const status = currentRide?.status;
  const hasRide = Boolean(currentRide);
  const matched = status === "matched";
  const active = status === "active";
  const live = matched || active;
  const driver = currentRide?.driver;
  const location = currentRide?.driverLocation;

  const unread = useTripChatUnread(chatMessages, rideId, "RIDER");
  // A tapped chat notification opens the chat from here.
  useTripChatOpenRequests(rideId, () => {
    if (!isTripChatOpen(rideId)) router.push("/rider-chat");
  });
  const { canCall, busy: callBusy, checking: callChecking, callDriver } = useCallDriver(currentRide);

  useEffect(() => {
    if (
      backgroundPromptedRef.current ||
      backgroundGranted ||
      (currentRide?.status !== "matched" && currentRide?.status !== "active")
    ) {
      return;
    }

    backgroundPromptedRef.current = true;
    void requestBackgroundLocationAccess();
  }, [
    backgroundGranted,
    currentRide?.status,
    requestBackgroundLocationAccess,
  ]);

  // Where the trip goes next. Only while this screen is the one showing: it
  // stays mounted behind the others, and must not pull the rider off them.
  useEffect(() => {
    if (!isFocused) return;
    if (status === "completed") {
      router.replace("/rider/trip-rating");
      return;
    }
    if (status === "cancelled") {
      Alert.alert("Ride cancelled", "This ride has been cancelled.");
      router.replace("/rider");
      return;
    }
    if (!hasRide) {
      // After a restart the trip is fetched again once the connection is up: give it a moment.
      const timer = setTimeout(() => router.replace("/rider"), 3000);
      return () => clearTimeout(timer);
    }
  }, [hasRide, isFocused, router, status]);

  const destination = itinerary.stops[itinerary.stops.length - 1] ?? "";
  const firstName = driver?.driverName?.trim().split(/\s+/)[0];
  const headline = matched
    ? `${firstName || "Your driver"} is on the way`
    : active
      ? `Heading to ${shortPlace(destination) || "your destination"}`
      : "Finding your driver";

  // Live first: the distance arrives with every driver GPS update, so the
  // minutes tick down as the driver moves; etaSeconds is the opening value.
  const etaMinutes = !matched
    ? null
    : isNumber(location?.distanceToNextStopKm)
      ? estimateEtaMinutes(location.distanceToNextStopKm)
      : driver?.etaSeconds
        ? Math.max(1, Math.ceil(driver.etaSeconds / 60))
        : null;
  const kmLeft = active && isNumber(location?.distanceToNextStopKm) ? location.distanceToNextStopKm : null;
  const nextStop = shortPlace(location?.nextStopAddress);
  const chip = etaMinutes
    ? { label: "Arrives in", value: `${etaMinutes} min` }
    : kmLeft !== null
      ? { label: extraStops > 0 ? "To next stop" : "Distance left", value: `${kmLeft.toFixed(1)} km` }
      : null;

  const movement = location?.isStale
    ? "Driver location paused. Waiting for the next update."
    : kmLeft !== null
      ? `${kmLeft.toFixed(1)} km to ${nextStop || "go"}`
      : null;
  // How much of the planned distance has been driven, when the server reports both.
  const progress =
    active && isNumber(location?.totalDistanceKm) && isNumber(currentRide?.plannedDistanceKm) && currentRide.plannedDistanceKm > 0
      ? Math.min(1, Math.max(0, location.totalDistanceKm / currentRide.plannedDistanceKm))
      : null;

  const agreed = driver?.lockedFareNgn;
  const price = isNumber(agreed) ? agreed : currentRide?.fareEstimateNgn;
  const nameLine = [driver?.driverName?.trim() || "Your driver", isNumber(driver?.driverRating) ? driver.driverRating.toFixed(1) : null]
    .filter(Boolean)
    .join(" · ");

  const mapHeight = Math.round(Math.min(active ? 360 : 320, Math.max(230, windowHeight * 0.36)));

  if (!currentRide) {
    return (
      <View style={[styles.screen, styles.waiting]}>
        <StatusBar style="dark" />
        <ActivityIndicator color={colors.ink} />
        <RText color={colors.muted}>Looking for your trip</RText>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <LiveMap
        destination={currentRide.route?.destination}
        driverLocation={currentRide.driverLocation}
        fitPadding={{ top: insets.top + 76, right: 28, bottom: 56, left: 28 }}
        height={mapHeight}
        initialCenter={currentRide.route?.pickup}
        pickup={currentRide.route?.pickup}
        route={currentRide.route?.route}
        stops={currentRide.route?.stops}>
        <View pointerEvents="box-none" style={[styles.mapTop, { top: insets.top + 8 }]}>
          <RBack
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace("/rider");
            }}
          />
          {chip ? (
            <View accessibilityLabel={`${chip.label} ${chip.value}`} accessible style={styles.chip}>
              <RText color={colors.onInkMuted} style={styles.chipLabel}>
                {chip.label}
              </RText>
              <RText color={colors.orange} variant="figure">
                {chip.value}
              </RText>
            </View>
          ) : null}
        </View>
      </LiveMap>

      <ScrollView
        bounces={false}
        contentContainerStyle={[styles.sheetContent, { paddingBottom: insets.bottom + 22 }]}
        showsVerticalScrollIndicator={false}
        style={styles.sheet}>
        <View style={styles.headline}>
          <RText accessibilityRole="header" numberOfLines={2} style={styles.title} variant="heading">
            {headline}
          </RText>
          {movement ? (
            <RText accessibilityLiveRegion="polite" color={colors.muted} style={styles.sub}>
              {movement}
            </RText>
          ) : null}
        </View>

        {progress !== null ? (
          <View
            accessibilityLabel={`${Math.round(progress * 100)} percent of the trip done`}
            accessibilityRole="progressbar"
            style={styles.track}>
            <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
        ) : null}

        {driver ? (
          <View style={styles.driver}>
            <RAvatar name={driver.driverName} size={56} />
            <View style={styles.driverText}>
              <RText numberOfLines={1} style={styles.driverName}>
                {nameLine}
              </RText>
              {driver.vehicleModel?.trim() ? (
                <RText color={colors.muted} numberOfLines={1} variant="small">
                  {driver.vehicleModel.trim()}
                </RText>
              ) : null}
            </View>
            {driver.vehiclePlate?.trim() ? (
              <View accessibilityLabel={`Plate ${driver.vehiclePlate.trim()}`} accessible style={styles.plate}>
                <RText style={styles.plateText}>{driver.vehiclePlate.trim()}</RText>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* The trip code, until the trip starts: the driver cannot start without it. */}
        {currentRide.tripCode && matched ? (
          <View
            accessibilityLabel={`Your trip code is ${currentRide.tripCode.split("").join(" ")}. Give this code to your driver when you get in.`}
            accessible
            style={styles.code}>
            <View style={styles.codeText}>
              <RText color={colors.onInkMuted} variant="small">
                Your trip code
              </RText>
              <RText color={colors.onInkSoft} style={styles.codeNote}>
                Give this code to your driver when you get in.
              </RText>
            </View>
            <RText color={colors.orange} style={styles.codeDigits}>
              {currentRide.tripCode}
            </RText>
          </View>
        ) : null}

        {live ? (
          <View style={styles.actions}>
            {canCall || callChecking ? (
              <ActionButton
                disabled={!canCall || callBusy}
                icon="call"
                label="Call"
                onPress={callDriver}
              />
            ) : null}
            <ActionButton
              accessibilityLabel={unread > 0 ? `Chat, ${unread} unread` : "Chat"}
              badge={unread}
              icon="chatbubble-ellipses"
              label="Chat"
              onPress={() => router.push("/rider-chat")}
            />
          </View>
        ) : null}

        <View style={styles.price}>
          <View style={styles.priceText}>
            <RText color={colors.muted} style={styles.priceLabel}>
              {isNumber(agreed) ? "Agreed price" : "Estimated price"}
            </RText>
            <RText numberOfLines={2} style={styles.priceTo}>
              To {destination}
            </RText>
          </View>
          {isNumber(price) ? (
            <RText style={styles.priceAmount} variant="figure">
              {naira(price)}
            </RText>
          ) : null}
        </View>

        <Pressable
          accessibilityLabel="Add or change stop"
          accessibilityRole="button"
          onPress={() =>
            router.push({
              pathname: "/destination-search",
              params: {
                flowMode: "trip-edit",
                itinerary: serializedItinerary,
              },
            })
          }
          style={({ pressed }) => [styles.stops, pressed ? styles.pressed : null]}>
          <Ionicons color={colors.ink} name="add-circle-outline" size={22} />
          <View style={styles.priceText}>
            <RText variant="bodyBold">Add or change stop</RText>
            {extraStops > 0 ? (
              <RText color={colors.muted} variant="small">
                {extraStops} extra stop{extraStops === 1 ? "" : "s"} on this trip
              </RText>
            ) : null}
          </View>
          <Ionicons color={colors.muted} name="chevron-forward" size={18} />
        </Pressable>

        <View style={styles.spacer} />

        <View style={styles.foot}>
          <RLink
            accessibilityLabel="Cancel ride"
            color={colors.danger}
            onPress={() => router.push("/rider-cancel")}
            title="Cancel ride"
          />
          <RLink
            accessibilityLabel="Chat with support"
            onPress={() => router.push("/support/chat")}
            title="Support"
          />
          {/* Reaches our safety team; it only means anything while the trip is live. */}
          <EmergencyButton rideId={currentRide.rideId} role="RIDER" />
        </View>
      </ScrollView>
    </View>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
  disabled,
  badge = 0,
  accessibilityLabel,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  badge?: number;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.action, disabled ? styles.dimmed : null, pressed ? styles.pressed : null]}>
      <Ionicons color={colors.ink} name={icon} size={20} />
      <RText variant="bodyBold">{label}</RText>
      {badge > 0 ? (
        <View style={styles.badge}>
          <RText color="#FFFFFF" style={styles.badgeText}>
            {badge > 9 ? "9+" : badge}
          </RText>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  waiting: { alignItems: "center", justifyContent: "center", gap: 12 },
  pressed: { opacity: 0.72 },
  dimmed: { opacity: 0.45 },

  mapTop: {
    position: "absolute",
    left: rider.gutter,
    right: rider.gutter,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, backgroundColor: colors.ink },
  chipLabel: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 16 },

  sheet: {
    flex: 1,
    marginTop: -24,
    backgroundColor: colors.cream,
    borderTopLeftRadius: rider.radius.sheet,
    borderTopRightRadius: rider.radius.sheet,
  },
  sheetContent: { flexGrow: 1, paddingHorizontal: rider.gutter, paddingTop: 22, gap: 14 },
  headline: { gap: 4 },
  title: { fontSize: 26, lineHeight: 30 },
  sub: { fontSize: 15, lineHeight: 21 },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.line, overflow: "hidden" },
  fill: { height: 8, borderRadius: 4, backgroundColor: colors.orange },

  driver: { flexDirection: "row", alignItems: "center", gap: 12 },
  driverText: { flex: 1, minWidth: 0, gap: 2 },
  driverName: { fontFamily: fonts.bold, fontSize: 18, lineHeight: 24 },
  plate: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.ink,
  },
  plateText: { fontFamily: fonts.displayBold, fontSize: 17, lineHeight: 22, letterSpacing: 0.7 },

  code: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: 16,
    borderRadius: 20,
    backgroundColor: colors.ink,
  },
  codeText: { flex: 1, gap: 4 },
  codeNote: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  codeDigits: {
    fontFamily: fonts.display,
    fontSize: 42,
    lineHeight: 48,
    letterSpacing: 5,
    fontVariant: ["tabular-nums"],
    flexShrink: 0,
  },

  actions: { flexDirection: "row", gap: 10 },
  action: {
    flex: 1,
    height: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: rider.radius.md,
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.card,
  },
  badge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontFamily: fonts.bold, fontSize: 12, lineHeight: 16 },

  price: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: rider.radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  priceText: { flex: 1, minWidth: 0 },
  priceLabel: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  priceTo: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 20 },
  priceAmount: { fontSize: 24, lineHeight: 28, flexShrink: 0 },

  stops: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: rider.radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },

  spacer: { flexGrow: 1 },
  foot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
});
