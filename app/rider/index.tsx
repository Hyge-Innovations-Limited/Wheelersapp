import { Ionicons } from "@expo/vector-icons";
import { Href, useFocusEffect, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BrandLogo } from "@/components/brand-logo";
import { LiveMap } from "@/components/live-map";
import { naira, rider, RText } from "@/components/rider/kit";
import type { ScheduledRide } from "@/lib/api";
import { useAppLocation } from "@/lib/location";
import { useAppNotifications } from "@/lib/notifications";
import { useRiderTrips } from "@/lib/rider-trips";
import { serializeRideItinerary, type RideItinerary } from "@/lib/ride-route";
import { useRideSession } from "@/lib/ride-session";
import { useSavedPlaces, type SavedPlace } from "@/lib/saved-places";
import { useScheduledRides } from "@/lib/scheduled-rides";
import { useWalletOverview } from "@/lib/wallet-overview";

const { colors, fonts, radius, gutter } = rider;

const riderHomeCenter = {
  lat: 6.4473,
  lng: 3.4729,
};

const SHEET_MS = 280;
/** Kept between the top row and the sheet so some map always shows. */
const MAP_PEEK = 40;

/* ── last ride ─────────────────────────────────────────────────────────── */

/** Rides whose screen was already reopened after a restart, so it happens once per ride. */
const reopenedRideIds = new Set<string>();

type RoutePair = { pickup: string; destination: string };

/** "12 Herbert Macaulay Way" from "12 Herbert Macaulay Way, Yaba, Lagos": the short name shown on a card. */
function shortPlace(address: string): string {
  return address.split(",")[0]?.trim() || address;
}

/* ── scheduled ride ────────────────────────────────────────────────────── */

function nextScheduledRide(rides: ScheduledRide[]): ScheduledRide | null {
  const now = Date.now();
  let next: ScheduledRide | null = null;
  let nextAt = Infinity;
  for (const ride of rides) {
    if (ride.status !== "SCHEDULED" && ride.status !== "DISPATCHING") continue;
    const at = new Date(ride.scheduledFor).getTime();
    if (!Number.isFinite(at) || at < now) continue;
    if (at < nextAt) {
      next = ride;
      nextAt = at;
    }
  }
  return next;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "tomorrow, 7:30 am" */
function formatScheduledFor(value: string): string {
  const date = new Date(value);
  const now = new Date();
  const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((dayStart(date) - dayStart(now)) / 86_400_000);
  const day =
    days === 0
      ? "today"
      : days === 1
        ? "tomorrow"
        : `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
  const hour = date.getHours() % 12 === 0 ? 12 : date.getHours() % 12;
  const minute = date.getMinutes().toString().padStart(2, "0");
  return `${day}, ${hour}:${minute} ${date.getHours() < 12 ? "am" : "pm"}`;
}

function firstPart(address: string): string {
  const part = address.split(",")[0]?.trim();
  return part && part.length > 0 ? part : address;
}

function savedPlaceIcon(place: SavedPlace): keyof typeof Ionicons.glyphMap {
  const label = place.label.toLowerCase();
  return label === "home" ? "home-outline" : label === "work" ? "briefcase-outline" : "location-outline";
}

export default function RiderHomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const { permissionState, requestLocationAccess } = useAppLocation();
  const { permissionGranted, requestNotificationAccess } = useAppNotifications();
  const { trips: pastTrips } = useRiderTrips(10);
  const { overview } = useWalletOverview();
  const { rawItems: scheduledRides, refresh: refreshScheduledRides } = useScheduledRides();
  const { places: savedPlaces } = useSavedPlaces();
  const { currentRide } = useRideSession();

  /* ── permissions: one ask at a time ─────────────────────────────────── */

  const notificationPromptedRef = useRef(false);

  useEffect(() => {
    if (permissionState !== "idle") return;
    void requestLocationAccess();
  }, [permissionState, requestLocationAccess]);

  useEffect(() => {
    if (notificationPromptedRef.current || permissionGranted) return;
    // One consent conversation at a time: wait until the LOCATION flow has
    // settled (granted or declined) before opening the notifications ask —
    // both used to fire on mount and stack their dialogs on top of each other.
    if (permissionState === "idle") return;
    notificationPromptedRef.current = true;
    void requestNotificationAccess();
  }, [permissionGranted, permissionState, requestNotificationAccess]);

  /* ── data for the sheet ─────────────────────────────────────────────── */

  // A ride scheduled on another screen should show here on the way back.
  const firstFocusRef = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocusRef.current) {
        firstFocusRef.current = false;
        return;
      }
      void refreshScheduledRides();
    }, [refreshScheduledRides]),
  );

  const scheduled = useMemo(() => nextScheduledRide(scheduledRides), [scheduledRides]);

  // The full addresses as booked, so Repeat and Reverse find the same places again.
  const lastRide = useMemo<RoutePair | null>(() => {
    const ride = pastTrips.find(
      (trip) => trip.status === "COMPLETED" && trip.pickupAddress.trim() && trip.destAddress.trim(),
    );
    return ride ? { pickup: ride.pickupAddress.trim(), destination: ride.destAddress.trim() } : null;
  }, [pastTrips]);

  const liveStatus = currentRide?.status;
  const rideIsSearching =
    liveStatus === "requesting" || liveStatus === "bidding" || liveStatus === "matching";
  const rideIsOn = liveStatus === "matched" || liveStatus === "active";
  const liveRide = currentRide && (rideIsSearching || rideIsOn) ? currentRide : null;

  const openLiveRide = () => {
    if (!liveRide) return;
    const itinerary = serializeRideItinerary(liveRide.itinerary);
    if (rideIsOn) {
      router.push({ pathname: "/rider/active-trip", params: { itinerary } } as Href);
      return;
    }
    router.push({
      pathname: "/matching",
      params:
        typeof liveRide.riderOfferNgn === "number"
          ? { itinerary, offer: String(liveRide.riderOfferNgn) }
          : { itinerary },
    } as Href);
  };

  // Back in the app with a ride still going (the app was closed mid-search or
  // mid-trip): its screen opens by itself, once. A ride started in this run is
  // left alone, so coming Home on purpose does not bounce the rider back.
  useFocusEffect(
    useCallback(() => {
      if (!liveRide?.restored || reopenedRideIds.has(liveRide.rideId)) return;
      reopenedRideIds.add(liveRide.rideId);
      openLiveRide();
      // openLiveRide reads the same liveRide this effect depends on.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [liveRide?.restored, liveRide?.rideId, liveRide?.status]),
  );

  const bookRoute = (itinerary: RideItinerary) => {
    router.push({
      pathname: "/ride-selection",
      params: { itinerary: serializeRideItinerary(itinerary), source: "history" },
    } as Href);
  };

  /* ── the sheet: up to book, down to see the map ─────────────────────── */

  const [open, setOpen] = useState(true);
  const [rootHeight, setRootHeight] = useState(0);
  const [sheetHeight, setSheetHeight] = useState(0);
  const [peekHeight, setPeekHeight] = useState(0);
  const [bodyHeight, setBodyHeight] = useState(0);

  const screenHeight = rootHeight > 0 ? rootHeight : window.height;
  const topRowBottom = insets.top + 12 + 48;
  const maxSheetHeight = Math.max(240, screenHeight - topRowBottom - MAP_PEEK);
  const maxBodyHeight = Math.max(0, maxSheetHeight - peekHeight);
  const bodyScrolls = bodyHeight > maxBodyHeight + 1;
  const closedOffset = peekHeight > 0 ? Math.max(0, sheetHeight - peekHeight) : 0;

  const translateY = useSharedValue(0);
  const closedY = useSharedValue(0);
  const dragStart = useSharedValue(0);
  const sheetH = useSharedValue(0);

  useEffect(() => {
    closedY.value = closedOffset;
    sheetH.value = sheetHeight;
    translateY.value = withTiming(open ? 0 : closedOffset, { duration: SHEET_MS });
  }, [closedOffset, closedY, open, sheetH, sheetHeight, translateY]);

  const [headerPan, bodyPan] = useMemo(() => {
    const make = (enabled: boolean) =>
      Gesture.Pan()
        .enabled(enabled)
        .activeOffsetY([-10, 10])
        .failOffsetX([-24, 24])
        .onStart(() => {
          dragStart.value = translateY.value;
        })
        .onUpdate((event) => {
          translateY.value = Math.min(
            closedY.value,
            Math.max(0, dragStart.value + event.translationY),
          );
        })
        .onEnd((event) => {
          const goDown =
            event.velocityY > 500 ||
            (event.velocityY > -500 && translateY.value > closedY.value / 2);
          translateY.value = withTiming(goDown ? closedY.value : 0, { duration: SHEET_MS });
          runOnJS(setOpen)(!goDown);
        });
    // When the sheet's lower part is tall enough to scroll, swipes there
    // scroll it; the top part still moves the sheet.
    return [make(true), make(!bodyScrolls)];
  }, [bodyScrolls, closedY, dragStart, translateY]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  // The map's middle (where the rider is) stays in the part the sheet leaves
  // uncovered, whichever way the sheet is.
  const mapStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -Math.max(0, sheetH.value - translateY.value) / 2 }],
  }));

  const walletLabel = overview ? naira(overview.balanceNgn) : "Wallet";

  return (
    <View
      onLayout={(event) => setRootHeight(event.nativeEvent.layout.height)}
      style={styles.root}>
      <StatusBar style="dark" />

      <Animated.View style={[styles.map, mapStyle]}>
        <LiveMap
          height={screenHeight}
          initialCenter={riderHomeCenter}
          initialDelta={{ latitudeDelta: 0.038, longitudeDelta: 0.03 }}
        />
      </Animated.View>

      <View pointerEvents="box-none" style={[styles.topRow, { top: insets.top + 12 }]}>
        <Pressable
          accessibilityLabel="Your account"
          accessibilityRole="button"
          onPress={() => router.push("/rider/profile" as Href)}
          style={({ pressed }) => [styles.logo, pressed ? styles.pressed : null]}>
          <BrandLogo size={48} />
        </Pressable>
        <Pressable
          accessibilityLabel={overview ? `Wallet balance ${walletLabel}` : "Wallet"}
          accessibilityRole="button"
          onPress={() => router.push("/rider/wallet" as Href)}
          style={({ pressed }) => [styles.wallet, pressed ? styles.pressed : null]}>
          <Ionicons color={colors.orange} name="wallet-outline" size={18} />
          <RText color={colors.cream} maxFontSizeMultiplier={1.15} style={styles.walletText}>
            {walletLabel}
          </RText>
        </Pressable>
      </View>

      <Animated.View
        onLayout={(event) => setSheetHeight(event.nativeEvent.layout.height)}
        style={[styles.sheet, sheetStyle]}>
        <GestureDetector gesture={headerPan}>
          <View
            onLayout={(event) => setPeekHeight(event.nativeEvent.layout.height)}
            style={styles.peek}>
            <Pressable
              accessibilityLabel={open ? "Swipe down to see the map" : "Swipe up to book a ride"}
              accessibilityRole="button"
              accessibilityState={{ expanded: open }}
              onPress={() => setOpen((current) => !current)}
              style={styles.handleButton}>
              <View style={styles.handle} />
            </Pressable>

            <RText accessibilityRole="header" variant="title">
              Where are you going?
            </RText>

            <View style={styles.searchRow}>
              <Pressable
                accessibilityLabel="Search destination"
                accessibilityRole="button"
                onPress={() => router.push("/destination-search" as Href)}
                style={({ pressed }) => [styles.search, pressed ? styles.pressed : null]}>
                <Ionicons color={colors.ink} name="search" size={22} />
                <RText color={colors.muted} numberOfLines={1} style={styles.searchText}>
                  Search destination
                </RText>
              </Pressable>
              <Pressable
                accessibilityLabel="Later: schedule a ride"
                accessibilityRole="button"
                onPress={() => router.push("/schedule-ride" as Href)}
                style={({ pressed }) => [styles.later, pressed ? styles.pressed : null]}>
                <Ionicons color={colors.orange} name="calendar-outline" size={18} />
                <RText color={colors.cream} maxFontSizeMultiplier={1.15} variant="bodyBold">
                  Later
                </RText>
              </Pressable>
            </View>
          </View>
        </GestureDetector>

        <GestureDetector gesture={bodyPan}>
          <View
            accessibilityElementsHidden={!open}
            importantForAccessibility={open ? "auto" : "no-hide-descendants"}
            style={{ maxHeight: maxBodyHeight }}>
            <ScrollView
              bounces={false}
              scrollEnabled={bodyScrolls}
              showsVerticalScrollIndicator={false}>
              <View
                onLayout={(event) => setBodyHeight(event.nativeEvent.layout.height)}
                style={styles.body}>
                {liveRide ? (
                  <Pressable
                    accessibilityLabel="Your ride. Return to it"
                    accessibilityRole="button"
                    onPress={openLiveRide}
                    style={({ pressed }) => [styles.liveRide, pressed ? styles.pressed : null]}>
                    <View style={styles.liveRideIcon}>
                      <Ionicons color={colors.ink} name="car-sport" size={20} />
                    </View>
                    <View style={styles.flexText}>
                      <RText color={colors.orange} variant="bodyBold">
                        Your ride
                      </RText>
                      <RText color={colors.onInkSoft} numberOfLines={1} variant="small">
                        {rideIsSearching
                          ? "Finding you a driver"
                          : liveStatus === "active"
                            ? "Trip in progress"
                            : "Your driver is on the way"}
                      </RText>
                    </View>
                    <Ionicons color={colors.onInkMuted} name="chevron-forward" size={18} />
                  </Pressable>
                ) : null}

                {scheduled ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() =>
                      router.push({
                        pathname: "/rider/history",
                        params: { tab: "scheduled" },
                      } as Href)
                    }
                    style={({ pressed }) => [styles.scheduled, pressed ? styles.pressed : null]}>
                    <View style={styles.flexText}>
                      <RText numberOfLines={1} style={styles.scheduledTitle}>
                        Scheduled ride: {formatScheduledFor(scheduled.scheduledFor)}
                      </RText>
                      <RText color={colors.muted} numberOfLines={1} variant="small">
                        {firstPart(scheduled.pickupAddress)} to {firstPart(scheduled.destAddress)}
                      </RText>
                    </View>
                    <Ionicons color={colors.muted} name="chevron-forward" size={16} />
                  </Pressable>
                ) : null}

                {/* A second ride cannot be booked while one is live. */}
                {lastRide && !liveRide ? (
                  <View style={styles.group}>
                    <RText variant="label">LAST RIDE</RText>
                    <View style={styles.pairRow}>
                      <Pressable
                        accessibilityLabel={`Repeat: ${shortPlace(lastRide.pickup)} to ${shortPlace(lastRide.destination)}`}
                        accessibilityRole="button"
                        onPress={() =>
                          bookRoute({ pickup: lastRide.pickup, stops: [lastRide.destination] })
                        }
                        style={({ pressed }) => [
                          styles.lastRide,
                          styles.lastRideInk,
                          pressed ? styles.pressed : null,
                        ]}>
                        <View style={styles.lastRideHead}>
                          <Ionicons color={colors.orange} name="refresh" size={18} />
                          <RText color={colors.orange} variant="bodyBold">
                            Repeat
                          </RText>
                        </View>
                        <RText color={colors.onInkSoft} numberOfLines={1} variant="small">
                          {shortPlace(lastRide.pickup)} to {shortPlace(lastRide.destination)}
                        </RText>
                      </Pressable>
                      <Pressable
                        accessibilityLabel={`Reverse: ${shortPlace(lastRide.destination)} to ${shortPlace(lastRide.pickup)}`}
                        accessibilityRole="button"
                        onPress={() =>
                          bookRoute({ pickup: lastRide.destination, stops: [lastRide.pickup] })
                        }
                        style={({ pressed }) => [
                          styles.lastRide,
                          styles.lastRideCard,
                          pressed ? styles.pressed : null,
                        ]}>
                        <View style={styles.lastRideHead}>
                          <Ionicons color={colors.ink} name="swap-horizontal" size={18} />
                          <RText variant="bodyBold">Reverse</RText>
                        </View>
                        <RText color={colors.muted} numberOfLines={1} variant="small">
                          {shortPlace(lastRide.destination)} to {shortPlace(lastRide.pickup)}
                        </RText>
                      </Pressable>
                    </View>
                  </View>
                ) : null}

                {savedPlaces.length > 0 ? (
                  <View style={styles.pairRow}>
                    <ScrollView
                      contentContainerStyle={styles.chips}
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={styles.chipScroll}>
                      {savedPlaces.map((place) => (
                        <Pressable
                          accessibilityLabel={`Go to ${place.label}`}
                          accessibilityRole="button"
                          key={place.id}
                          onPress={() =>
                            router.push({
                              pathname: "/destination-search",
                              params: { destination: place.address },
                            } as Href)
                          }
                          style={({ pressed }) => [
                            styles.chip,
                            savedPlaces.length <= 2 ? styles.chipWide : null,
                            pressed ? styles.pressed : null,
                          ]}>
                          <Ionicons color={colors.orangeText} name={savedPlaceIcon(place)} size={18} />
                          <RText numberOfLines={1} style={styles.chipText}>
                            {place.label}
                          </RText>
                        </Pressable>
                      ))}
                    </ScrollView>
                    <Pressable
                      accessibilityLabel="Saved places"
                      accessibilityRole="button"
                      onPress={() => router.push("/saved-places" as Href)}
                      style={({ pressed }) => [styles.addChip, pressed ? styles.pressed : null]}>
                      <Ionicons color={colors.ink} name="add" size={24} />
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.push("/saved-places" as Href)}
                    style={({ pressed }) => [styles.addPlace, pressed ? styles.pressed : null]}>
                    <Ionicons color={colors.ink} name="add" size={22} />
                    <RText style={styles.chipText}>Add a place</RText>
                  </Pressable>
                )}
              </View>
            </ScrollView>
          </View>
        </GestureDetector>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.tint, overflow: "hidden" },
  pressed: { opacity: 0.72 },
  flexText: { flex: 1, minWidth: 0 },

  map: { position: "absolute", top: 0, left: 0, right: 0 },

  topRow: {
    position: "absolute",
    left: gutter,
    right: gutter,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  logo: { width: 48, height: 48 },
  wallet: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 48,
    paddingHorizontal: 16,
    borderRadius: 24,
    backgroundColor: colors.ink,
  },
  walletText: { fontFamily: fonts.bold, fontSize: 16, fontVariant: ["tabular-nums"] },

  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.cream,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: gutter,
  },
  peek: { gap: 14, paddingBottom: 14 },
  handleButton: {
    height: 44,
    marginBottom: -22,
    alignItems: "center",
    justifyContent: "flex-start",
  },
  handle: { width: 48, height: 5, marginTop: 10, borderRadius: 3, backgroundColor: "#B8AE9E" },

  searchRow: { flexDirection: "row", gap: 10 },
  search: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    height: 60,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.ink,
  },
  searchText: { fontFamily: fonts.medium, fontSize: 17 },
  later: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 60,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.ink,
  },

  body: { gap: 14, paddingBottom: 16 },

  liveRide: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 68,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radius.lg,
    backgroundColor: colors.ink,
  },
  liveRideIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.orange,
    alignItems: "center",
    justifyContent: "center",
  },

  scheduled: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: colors.orangeSoft,
  },
  scheduledTitle: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 20 },

  group: { gap: 8 },
  pairRow: { flexDirection: "row", gap: 10 },
  lastRide: {
    flex: 1,
    minWidth: 0,
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radius.lg,
  },
  lastRideInk: { backgroundColor: colors.ink },
  lastRideCard: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  lastRideHead: { flexDirection: "row", alignItems: "center", gap: 6 },

  chipScroll: { flex: 1 },
  chips: { flexGrow: 1, gap: 10 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 52,
    maxWidth: 180,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  chipWide: { flex: 1, maxWidth: undefined },
  chipText: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 20 },
  addChip: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  addPlace: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 52,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.ink,
  },
});
