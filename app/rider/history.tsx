import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import { RButton, RCard, RLink, RPill, RScreen, RText, naira, rider } from "@/components/rider/kit";
import type { ScheduledRide } from "@/lib/api";
import {
  rebookParams,
  tripEndedAt,
  tripPaidNgn,
  useHasLoaded,
  useRiderTrips,
  type RiderTrip,
} from "@/lib/rider-trips";
import { useScheduledRides } from "@/lib/scheduled-rides";
import {
  cancelWords,
  distanceWords,
  parseDate,
  pastWords,
  pickupWords,
  routeWords,
} from "@/lib/trip-words";
import { toUserMessage } from "@/lib/error-messages";

const { colors, fonts, radius } = rider;

/** "Cancel ride" on the dark card: red light enough to read on ink. */
const DANGER_ON_INK = "#FFB3B3";
const NOTICE_MS = 6000;

type TripsTab = "upcoming" | "past";

const TABS: { id: TripsTab; label: string }[] = [
  { id: "upcoming", label: "Upcoming" },
  { id: "past", label: "Past" },
];

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function RiderTripsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string | string[]; toast?: string | string[] }>();
  const requestedTab: TripsTab = first(params.tab) === "scheduled" ? "upcoming" : "past";
  const requestedToast = first(params.toast);

  const [activeTab, setActiveTab] = useState<TripsTab>(requestedTab);
  const [notice, setNotice] = useState<string | null>(null);
  const handledToast = useRef<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  // The clock behind "Today" and "Tomorrow"; read again whenever the lists are.
  const [now, setNow] = useState(() => new Date());

  const { trips, isLoading: tripsLoading, error: tripsError, refresh: refreshTrips } = useRiderTrips(30);
  const {
    rawItems: scheduled,
    isLoading: scheduledLoading,
    error: scheduledError,
    cancelItem,
    refresh: refreshScheduled,
  } = useScheduledRides(30);
  const scheduledLoaded = useHasLoaded(scheduledLoading);

  useEffect(() => {
    setActiveTab(requestedTab);
  }, [requestedTab]);

  useEffect(() => {
    if (!requestedToast || handledToast.current === requestedToast) return;
    handledToast.current = requestedToast;
    setNotice(requestedToast);
  }, [requestedToast]);

  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timeout);
  }, [notice]);

  // Trips is a tab and stays mounted: coming back to it (after scheduling or
  // cancelling a ride elsewhere, or finishing one) reads the lists again. The
  // first visit is left to the hooks, which load on their own.
  const visited = useRef(false);
  useFocusEffect(
    useCallback(() => {
      setNow(new Date());
      if (!visited.current) {
        visited.current = true;
        return;
      }
      void refreshScheduled();
      void refreshTrips();
    }, [refreshScheduled, refreshTrips]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refreshScheduled(), refreshTrips({ force: true })]);
    } finally {
      setNow(new Date());
      setRefreshing(false);
    }
  }, [refreshScheduled, refreshTrips]);

  const upcoming = useMemo(
    () => [...scheduled].sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor)),
    [scheduled],
  );
  const featured = useMemo(() => trips.find((trip) => trip.status === "COMPLETED") ?? null, [trips]);
  const earlier = useMemo(() => trips.filter((trip) => trip !== featured), [trips, featured]);

  const confirmCancel = (ride: ScheduledRide) => {
    const when = parseDate(ride.scheduledFor);
    Alert.alert(
      "Cancel this ride?",
      `${routeWords(ride.pickupAddress, ride.destAddress)}${when ? `\n${pickupWords(when, new Date())}` : ""}`,
      [
        { text: "Keep ride", style: "cancel" },
        {
          text: "Cancel ride",
          style: "destructive",
          onPress: () => {
            setCancellingId(ride.id);
            cancelItem(ride.id, "rider_cancelled_schedule")
              .then(() => setNotice("Scheduled ride cancelled."))
              .catch((error: unknown) => {
                Alert.alert(
                  "Could not cancel this ride",
                  toUserMessage(error, "Please try again."),
                );
              })
              .finally(() => setCancellingId(null));
          },
        },
      ],
    );
  };

  const rebook = (trip: RiderTrip, direction: "same" | "reverse") => {
    const rebookWith = rebookParams(trip, direction);
    if (!rebookWith) return;
    router.push({ pathname: "/ride-selection", params: rebookWith } as Href);
  };

  const openReceipt = (trip: RiderTrip) =>
    router.push({ pathname: "/trip-receipt", params: { rideId: trip.id } } as Href);

  const scheduleAnother = (
    <RButton
      accessibilityLabel="Schedule another ride"
      icon={<Ionicons color={colors.ink} name="add" size={20} />}
      onPress={() => router.push("/schedule-ride" as Href)}
      size="md"
      title="Schedule another ride"
      variant="ghost"
    />
  );

  const renderUpcoming = () => {
    if (!scheduledLoaded && upcoming.length === 0) return <Loading label="Loading your scheduled rides" />;
    if (scheduledError && upcoming.length === 0) {
      return <Problem message={scheduledError} onRetry={() => void refreshScheduled()} />;
    }
    if (upcoming.length === 0) {
      return (
        <>
          <Empty
            icon="calendar-outline"
            title="No upcoming rides"
            body="Schedule a ride and it will show here until its search starts."
          />
          <RButton
            accessibilityLabel="Schedule a ride"
            icon={<Ionicons color={colors.ink} name="add" size={20} />}
            onPress={() => router.push("/schedule-ride" as Href)}
            size="md"
            title="Schedule a ride"
          />
        </>
      );
    }
    return (
      <>
        {upcoming.map((ride, index) => (
          <UpcomingCard
            cancelling={cancellingId === ride.id}
            key={ride.id}
            next={index === 0}
            now={now}
            onCancel={() => confirmCancel(ride)}
            onView={() => router.push({ pathname: "/scheduled-ride", params: { id: ride.id } } as Href)}
            ride={ride}
          />
        ))}
        <RText color={colors.muted} variant="small">
          We start the search shortly before your pickup time and notify you to choose a driver.
        </RText>
        <View style={styles.spacer} />
        {scheduleAnother}
      </>
    );
  };

  const renderPast = () => {
    if (tripsLoading && trips.length === 0) return <Loading label="Loading your trips" />;
    if (tripsError && trips.length === 0) {
      return <Problem message={tripsError} onRetry={() => void refreshTrips({ force: true })} />;
    }
    if (trips.length === 0) {
      return (
        <>
          <Empty icon="time-outline" title="No trips yet" body="Your finished rides will show here." />
          <RButton
            accessibilityLabel="Book a ride"
            onPress={() => router.push("/destination-search" as Href)}
            size="md"
            title="Book a ride"
          />
        </>
      );
    }
    return (
      <>
        {tripsError ? (
          <RText color={colors.danger} variant="small">
            {tripsError}
          </RText>
        ) : null}
        {featured ? (
          <RCard style={styles.featured} tone="outline">
            <View style={styles.featuredTop}>
              <View style={styles.grow}>
                <RText numberOfLines={2} style={styles.featuredRoute}>
                  {routeWords(featured.pickupAddress, featured.destAddress)}
                </RText>
                <RText color={colors.muted} variant="small">
                  {whenWords(featured, now)}
                </RText>
              </View>
              {tripPaidNgn(featured) !== null ? (
                <RText style={styles.featuredPrice} variant="figure">
                  {naira(tripPaidNgn(featured))}
                </RText>
              ) : null}
            </View>
            <View style={styles.featuredActions}>
              <RButton
                accessibilityLabel="Book this ride again"
                onPress={() => rebook(featured, "same")}
                size="md"
                style={styles.featuredButton}
                title="Book again"
              />
              <RButton
                accessibilityLabel="Book this ride the other way round"
                onPress={() => rebook(featured, "reverse")}
                size="md"
                style={styles.featuredButton}
                title="Reverse it"
                variant="ghost"
              />
              <RLink
                accessibilityLabel="Open the receipt for this ride"
                color={colors.orangeText}
                onPress={() => openReceipt(featured)}
                title="Receipt"
              />
            </View>
          </RCard>
        ) : null}
        {earlier.length > 0 ? (
          <View>
            {featured ? <RText variant="label">EARLIER</RText> : null}
            {earlier.map((trip, index) => (
              <PastRow
                key={trip.id}
                last={index === earlier.length - 1}
                now={now}
                onPress={() => openReceipt(trip)}
                trip={trip}
              />
            ))}
          </View>
        ) : null}
      </>
    );
  };

  return (
    <RScreen contentStyle={styles.screen} safeAreaEdges={["top", "left", "right"]}>
      <StatusBar style="dark" />
      <RText accessibilityRole="header" style={styles.title} variant="title">
        Trips
      </RText>

      <View accessibilityRole="tablist" style={styles.switch}>
        {TABS.map((tab) => {
          const on = tab.id === activeTab;
          return (
            <Pressable
              accessibilityLabel={`${tab.label} trips`}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              key={tab.id}
              onPress={() => setActiveTab(tab.id)}
              style={[styles.switchItem, on ? styles.switchItemOn : null]}>
              <RText color={on ? colors.cream : colors.ink} style={styles.switchText}>
                {tab.label}
              </RText>
            </Pressable>
          );
        })}
      </View>

      {notice ? (
        <View accessibilityLiveRegion="polite" style={styles.notice}>
          <Ionicons color={colors.green} name="checkmark-circle" size={20} />
          <RText color={colors.green} style={styles.grow} variant="smallBold">
            {notice}
          </RText>
          <Pressable
            accessibilityLabel="Dismiss"
            accessibilityRole="button"
            hitSlop={10}
            onPress={() => setNotice(null)}
            style={styles.noticeClose}>
            <Ionicons color={colors.green} name="close" size={18} />
          </Pressable>
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            colors={[colors.orange]}
            onRefresh={() => void onRefresh()}
            refreshing={refreshing}
            tintColor={colors.ink}
          />
        }
        showsVerticalScrollIndicator={false}
        style={styles.scroller}>
        {activeTab === "upcoming" ? renderUpcoming() : renderPast()}
      </ScrollView>
    </RScreen>
  );
}

/** "Yesterday, 6:40 pm" for when a past ride ended. */
function whenWords(trip: RiderTrip, now: Date): string {
  const ended = parseDate(tripEndedAt(trip));
  return ended ? pastWords(ended, now) : "";
}

function UpcomingCard({
  ride,
  next,
  now,
  cancelling,
  onView,
  onCancel,
}: {
  ride: ScheduledRide;
  /** The soonest ride gets the dark card. */
  next: boolean;
  now: Date;
  cancelling: boolean;
  onView: () => void;
  onCancel: () => void;
}) {
  const when = parseDate(ride.scheduledFor);
  const route = routeWords(ride.pickupAddress, ride.destAddress);
  const distance = distanceWords(ride.plannedDistanceKm);
  const searching = ride.status === "DISPATCHING";
  const hasPrice = typeof ride.fareEstimateNgn === "number" && Number.isFinite(ride.fareEstimateNgn);
  return (
    <RCard style={styles.upcoming} tone={next ? "ink" : "outline"}>
      <View style={styles.upcomingTop}>
        <RPill
          label={searching ? "Finding a driver" : "Scheduled"}
          tone={next ? "orange" : "soft"}
        />
        <RLink
          accessibilityLabel={`View details of your ride, ${route}`}
          color={next ? colors.orange : colors.orangeText}
          onPress={onView}
          title="View details"
        />
      </View>
      <RText color={next ? colors.orange : colors.ink} variant="title">
        {when ? pickupWords(when, now) : "Scheduled ride"}
      </RText>
      <View style={styles.upcomingRoute}>
        <View style={styles.grow}>
          <RText color={next ? colors.cream : colors.ink} numberOfLines={2} variant="bodyBold">
            {route}
          </RText>
          {distance ? (
            <RText color={next ? colors.onInkMuted : colors.muted} variant="small">
              {distance}
            </RText>
          ) : null}
        </View>
        {hasPrice ? (
          <RText color={next ? colors.cream : colors.ink} style={styles.upcomingPrice} variant="figure">
            {naira(ride.fareEstimateNgn)}
          </RText>
        ) : null}
      </View>
      <Pressable
        accessibilityLabel={`Cancel your ride, ${route}`}
        accessibilityRole="button"
        accessibilityState={{ disabled: cancelling, busy: cancelling }}
        disabled={cancelling}
        onPress={onCancel}
        style={({ pressed }) => [styles.cancel, pressed || cancelling ? styles.pressed : null]}>
        {cancelling ? (
          <ActivityIndicator color={next ? DANGER_ON_INK : colors.danger} />
        ) : (
          <RText color={next ? DANGER_ON_INK : colors.danger} style={styles.cancelText}>
            Cancel ride
          </RText>
        )}
      </Pressable>
    </RCard>
  );
}

function PastRow({
  trip,
  now,
  last,
  onPress,
}: {
  trip: RiderTrip;
  now: Date;
  last: boolean;
  onPress: () => void;
}) {
  const route = routeWords(trip.pickupAddress, trip.destAddress);
  const cancelled = trip.status === "CANCELLED";
  const paid = cancelled ? null : tripPaidNgn(trip);
  const when = whenWords(trip, now);
  return (
    <Pressable
      accessibilityLabel={[
        route,
        cancelled ? `Cancelled: ${cancelWords(trip.cancelReason)}` : null,
        when,
        paid !== null ? naira(paid) : null,
      ]
        .filter(Boolean)
        .join(", ")}
      accessibilityHint="Opens the receipt"
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, last ? null : styles.rowDivider, pressed ? styles.pressed : null]}>
      <View style={styles.grow}>
        <RText numberOfLines={1} variant="bodyBold">
          {route}
        </RText>
        {cancelled ? (
          <RText color={colors.danger} numberOfLines={2} style={styles.rowReason}>
            {cancelWords(trip.cancelReason)}
          </RText>
        ) : null}
        {when ? (
          <RText color={colors.muted} variant="small">
            {when}
          </RText>
        ) : null}
      </View>
      {paid !== null ? <RText style={styles.rowPrice}>{naira(paid)}</RText> : null}
      <Ionicons color={colors.muted} name="chevron-forward" size={18} />
    </Pressable>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <View accessibilityLabel={label} accessibilityRole="progressbar" style={styles.center}>
      <ActivityIndicator color={colors.ink} />
      <RText color={colors.muted} variant="small">
        {label}
      </RText>
    </View>
  );
}

function Problem({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.center}>
      <Ionicons color={colors.danger} name="cloud-offline-outline" size={32} />
      <RText style={styles.centerText} variant="bodyBold">
        We could not load this
      </RText>
      <RText color={colors.muted} style={styles.centerText} variant="small">
        {message}
      </RText>
      <RButton
        accessibilityLabel="Try again"
        onPress={onRetry}
        size="md"
        style={styles.retry}
        title="Try again"
        variant="ghost"
      />
    </View>
  );
}

function Empty({
  icon,
  title,
  body,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}) {
  return (
    <View style={styles.center}>
      <View style={styles.emptyIcon}>
        <Ionicons color={colors.orangeText} name={icon} size={28} />
      </View>
      <RText style={styles.centerText} variant="heading">
        {title}
      </RText>
      <RText color={colors.muted} style={styles.centerText} variant="small">
        {body}
      </RText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingTop: 10, paddingBottom: 0, gap: 14 },
  title: { fontSize: 30, lineHeight: 34 },
  grow: { flex: 1, minWidth: 0, gap: 2 },
  spacer: { flexGrow: 1 },
  pressed: { opacity: 0.72 },

  switch: { flexDirection: "row", padding: 4, borderRadius: radius.md, backgroundColor: colors.tint },
  switchItem: { flex: 1, height: 44, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  switchItemOn: { backgroundColor: colors.ink },
  switchText: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 20 },

  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 48,
    paddingLeft: 14,
    paddingRight: 4,
    borderRadius: radius.md,
    backgroundColor: colors.greenSoft,
  },
  noticeClose: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },

  scroller: { flex: 1 },
  list: { flexGrow: 1, gap: 14, paddingBottom: 20 },

  upcoming: { padding: 18, gap: 12 },
  upcomingTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  upcomingRoute: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  upcomingPrice: { fontSize: 24, lineHeight: 28, flexShrink: 0 },
  cancel: { alignSelf: "flex-start", minHeight: 44, minWidth: 44, justifyContent: "center" },
  cancelText: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20, textDecorationLine: "underline" },

  featured: { gap: 12 },
  featuredTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  featuredRoute: { fontFamily: fonts.bold, fontSize: 17, lineHeight: 22 },
  featuredPrice: { fontSize: 22, lineHeight: 26, flexShrink: 0 },
  featuredActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  featuredButton: { flex: 1, height: 48, paddingHorizontal: 8, borderRadius: 14 },

  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 60, paddingVertical: 12 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.line },
  rowReason: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20 },
  rowPrice: { fontFamily: fonts.bold, fontSize: 17, lineHeight: 22, fontVariant: ["tabular-nums"], flexShrink: 0 },

  center: { flexGrow: 1, alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 32 },
  centerText: { textAlign: "center" },
  retry: { alignSelf: "stretch", marginTop: 8 },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.orangeSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
});
