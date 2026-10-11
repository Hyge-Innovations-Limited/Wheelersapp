import { BackArrow } from "@/components/back-arrow";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import { AppCard } from "@/components/app-card";
import { AppScreen } from "@/components/app-screen";
import { AppText } from "@/components/app-text";
import { InterstateTravelForm } from "@/components/interstate-travel-form";
import { getAccessTokenWithRetry, type AccessTokenGetter } from "@/lib/access-token";
import { useAuth } from "@/lib/auth";
import { toUserMessage } from "@/lib/error-messages";
import {
  cancelInterstateBooking,
  describeDepartureStatus,
  formatDepartureTime,
  formatNaira,
  listInterstateBookings,
  routeLabel,
  type InterstateBooking,
} from "@/lib/interstate";
import { theme } from "@/theme";

type Tab = "book" | "trips";


/**
 * Interstate travel, from the rider's side.
 *
 * A city ride is a driver you hail; an interstate journey is a seat you buy on
 * a vehicle that leaves whether you are on it or not. So this screen is a
 * shopping flow, not a matching one: where from, where to, which departure, how
 * many seats — and then a ticket with a reference on it.
 */
export default function RiderInterstateScreen() {
  const router = useRouter();
  const { getAccessToken } = useAuth();
  const [tab, setTab] = useState<Tab>("book");

  return (
    <AppScreen
      backgroundColor={theme.colors.offWhite}
      contentStyle={styles.container}
      safeAreaEdges={["top", "left", "right"]}
    >
      <StatusBar style="dark" />

      <BackArrow onPress={() => router.navigate("/rider/profile")} />

      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <AppText variant="monoSmall" color={theme.colors.orange}>
            WHEELERS INTERSTATE
          </AppText>
          <AppText variant="h1">Where are you going?</AppText>
        </View>
        <View style={styles.headerIcon}>
          <MaterialIcons
            name="directions-bus"
            size={24}
            color={theme.colors.black}
          />
        </View>
      </View>

      <View style={styles.tabRow}>
        <TabButton
          label="Book travel"
          active={tab === "book"}
          onPress={() => setTab("book")}
        />
        <TabButton
          label="My trips"
          active={tab === "trips"}
          onPress={() => setTab("trips")}
        />
      </View>

      {tab === "book" ? (
        <InterstateTravelForm
          getAccessToken={getAccessToken}
          onSubmitted={() => setTab("trips")}
        />
      ) : (
        <TripsTab getAccessToken={getAccessToken} router={router} />
      )}
    </AppScreen>
  );
}

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      style={[styles.tabButton, active ? styles.tabButtonActive : null]}
    >
      <AppText
        variant="bodyMedium"
        color={active ? theme.colors.black : theme.colors.muted}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

/* ── Booking ─────────────────────────────────────────────────────────────── */

/* ── My trips ────────────────────────────────────────────────────────────── */

function TripsTab({
  getAccessToken,
  router,
}: {
  getAccessToken: AccessTokenGetter;
  router: ReturnType<typeof useRouter>;
}) {
  const [bookings, setBookings] = useState<InterstateBooking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const accessToken = await getAccessTokenWithRetry(getAccessToken);
      if (!accessToken) throw new Error("Please sign in again.");
      const result = await listInterstateBookings(accessToken);
      setBookings(result.bookings);
    } catch (loadError) {
      setError(toUserMessage(loadError, "We could not load your trips."));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const cancel = useCallback(
    (booking: InterstateBooking) => {
      const isPendingOffer = booking.status === "PENDING_OFFER";

      Alert.alert(
        isPendingOffer ? "Withdraw this offer?" : "Cancel this booking?",
        isPendingOffer
          ? "Drivers will stop seeing your price. You were never charged, so there is nothing to refund."
          : "How much you get back depends on how close we are to departure. This cannot be undone.",
        [
          { text: "Keep it", style: "cancel" },
          {
            text: isPendingOffer ? "Withdraw offer" : "Cancel booking",
            style: "destructive",
            onPress: () => {
              void (async () => {
                try {
                  const accessToken = await getAccessTokenWithRetry(getAccessToken);
                  if (!accessToken) throw new Error("Please sign in again.");
                  const result = await cancelInterstateBooking(
                    accessToken,
                    booking.id,
                  );
                  Alert.alert(
                    isPendingOffer ? "Offer withdrawn" : "Booking cancelled",
                    isPendingOffer
                      ? "Drivers will no longer see your price."
                      : result.refundedNgn > 0
                        ? `${formatNaira(result.refundedNgn)} is back in your wallet.`
                        : "This booking was too close to departure for a refund.",
                  );
                  await load();
                } catch (cancelError) {
                  Alert.alert(
                    "Could not cancel",
                    toUserMessage(cancelError, "Please try again in a moment."),
                  );
                }
              })();
            },
          },
        ],
      );
    },
    [getAccessToken, load],
  );

  if (isLoading) {
    return <Loading label="Loading your trips…" />;
  }

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={() => {
            setIsRefreshing(true);
            void load();
          }}
          tintColor={theme.colors.orange}
        />
      }
    >
      {error ? (
        <View style={styles.errorCard}>
          <MaterialIcons name="error-outline" size={18} color={theme.colors.danger} />
          <AppText variant="bodySmall" color={theme.colors.danger} style={styles.flex}>
            {error}
          </AppText>
        </View>
      ) : null}

      {bookings.length === 0 && !error ? (
        <Empty
          icon="confirmation-number"
          title="No interstate trips yet"
          body="When you book a seat between cities, your ticket and reference show up here."
        />
      ) : null}

      {bookings.map((booking) => {
        const isUpcoming = booking.status === "CONFIRMED";
        const isPendingOffer = booking.status === "PENDING_OFFER";
        const wasDeclined = booking.status === "OFFER_DECLINED";

        return (
          <AppCard key={booking.id} style={styles.bookingCard}>
            <View style={styles.departureHead}>
              <View style={styles.flex}>
                <AppText variant="h3">{routeLabel(booking.route)}</AppText>
                <AppText variant="bodySmall" color={theme.colors.muted}>
                  {formatDepartureTime(booking.departure.departureAt)}
                </AppText>
              </View>
              <StatusPill status={booking.status} />
            </View>

            <View style={styles.referenceRow}>
              <View>
                <AppText variant="monoSmall" color={theme.colors.muted}>
                  REFERENCE
                </AppText>
                <AppText variant="monoLarge">{booking.reference}</AppText>
              </View>
              <View style={styles.priceBlock}>
                <AppText variant="monoSmall" color={theme.colors.muted}>
                  {isPendingOffer ? "OFFERED" : booking.seats}
                  {isPendingOffer
                    ? ""
                    : ` ${booking.seats === 1 ? "SEAT" : "SEATS"}`}
                </AppText>
                <AppText variant="monoLarge">{formatNaira(booking.amountNgn)}</AppText>
              </View>
            </View>

            <View style={styles.metaRow}>
              <Meta
                icon="place"
                label={booking.route.origin.terminal}
              />
              <Meta
                icon="directions-bus"
                label={describeDepartureStatus(booking.departure.status)}
              />
            </View>

            {isPendingOffer ? (
              <View style={styles.noticeRow}>
                <MaterialIcons name="gavel" size={16} color={theme.colors.orange} />
                <AppText variant="bodySmall" color={theme.colors.muted} style={styles.flex}>
                  Waiting for a driver to accept your price. Nothing has been
                  charged — your seat is only held once someone says yes.
                </AppText>
              </View>
            ) : wasDeclined ? (
              <View style={styles.noticeRow}>
                <MaterialIcons name="info-outline" size={16} color={theme.colors.danger} />
                <AppText variant="bodySmall" color={theme.colors.muted} style={styles.flex}>
                  {booking.declineReason ??
                    "No driver took this price."}{" "}
                  You were not charged — try again a bit higher.
                </AppText>
              </View>
            ) : booking.departure.driver ? (
              <View style={styles.driverRow}>
                <MaterialIcons name="person" size={16} color={theme.colors.muted} />
                <AppText variant="bodySmall" color={theme.colors.muted}>
                  {booking.departure.driver.name ?? "Your driver"}
                  {booking.departure.vehiclePlate
                    ? ` · ${booking.departure.vehiclePlate}`
                    : ""}
                </AppText>
              </View>
            ) : (
              <AppText variant="bodySmall" color={theme.colors.muted}>
                A driver is assigned closer to departure.
              </AppText>
            )}

            {isUpcoming || isPendingOffer ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => cancel(booking)}
                style={styles.cancelRow}
              >
                <AppText variant="bodySmall" color={theme.colors.danger}>
                  {isPendingOffer ? "Withdraw this offer" : "Cancel this booking"}
                </AppText>
              </Pressable>
            ) : null}
          </AppCard>
        );
      })}

      <Pressable
        accessibilityRole="button"
        onPress={() => router.navigate("/rider")}
        style={styles.footerLink}
      >
        <AppText variant="bodySmall" color={theme.colors.muted}>
          Need a ride inside the city instead?
        </AppText>
      </Pressable>
    </ScrollView>
  );
}

/* ── Small pieces ────────────────────────────────────────────────────────── */




function Meta({
  icon,
  label,
  urgent,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  urgent?: boolean;
}) {
  return (
    <View style={styles.meta}>
      <MaterialIcons
        name={icon}
        size={14}
        color={urgent ? theme.colors.danger : theme.colors.muted}
      />
      <AppText
        variant="bodySmall"
        color={urgent ? theme.colors.danger : theme.colors.muted}
      >
        {label}
      </AppText>
    </View>
  );
}

/**
 * A booking's state in one word.
 *
 * "Offer sent" is its own thing on purpose: it is neither booked nor cancelled,
 * nothing has been charged, and a rider who reads it as either would be
 * misled — one into turning up at the park, the other into booking twice.
 */
function StatusPill({ status }: { status: InterstateBooking["status"] }) {
  const tone =
    status === "CONFIRMED"
      ? { bg: theme.colors.successLight, fg: theme.colors.green }
      : status === "COMPLETED"
        ? { bg: theme.colors.orangeLight, fg: theme.colors.black }
        : status === "PENDING_OFFER"
          ? { bg: theme.colors.orangeLight, fg: theme.colors.orange }
          : { bg: theme.colors.dangerLight, fg: theme.colors.danger };

  const label =
    status === "CONFIRMED"
      ? "Booked"
      : status === "COMPLETED"
        ? "Travelled"
        : status === "PENDING_OFFER"
          ? "Offer sent"
          : status === "OFFER_DECLINED"
            ? "Not taken"
            : status === "REFUNDED"
              ? "Refunded"
              : status === "NO_SHOW"
                ? "Missed"
                : "Cancelled";

  return (
    <View style={[styles.pill, { backgroundColor: tone.bg }]}>
      <AppText variant="monoSmall" color={tone.fg}>
        {label.toUpperCase()}
      </AppText>
    </View>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={theme.colors.orange} />
      <AppText variant="bodySmall" color={theme.colors.muted}>
        {label}
      </AppText>
    </View>
  );
}

function Empty({
  icon,
  title,
  body,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  body: string;
}) {
  return (
    <View style={styles.empty}>
      <MaterialIcons name={icon} size={28} color={theme.colors.mutedLight} />
      <AppText variant="bodyMedium">{title}</AppText>
      <AppText variant="bodySmall" color={theme.colors.muted} style={styles.center}>
        {body}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 0, paddingBottom: 0 },
  flex: { flex: 1 },
  center: { textAlign: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.gutter,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
  },
  headerCopy: { flex: 1, gap: 2 },
  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.orangeLight,
    alignItems: "center",
    justifyContent: "center",
    ...theme.shadows.card,
  },
  tabRow: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.gutter,
    paddingBottom: theme.spacing.md,
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.white,
  },
  tabButtonActive: {
    borderColor: theme.colors.black,
    borderWidth: theme.borders.thick,
    backgroundColor: theme.colors.orangeLight,
  },
  scrollContent: {
    paddingHorizontal: theme.spacing.gutter,
    paddingBottom: theme.spacing.xxxl,
    gap: theme.spacing.lg,
  },
  section: { gap: theme.spacing.md },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  stepDot: {
    width: 22,
    height: 22,
    borderRadius: theme.radius.pill,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.orangeLight,
    alignItems: "center",
    justifyContent: "center",
  },
  chipRow: { gap: theme.spacing.sm, paddingRight: theme.spacing.gutter },
  chip: {
    minWidth: 104,
    gap: 2,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.white,
  },
  chipActive: {
    borderColor: theme.colors.black,
    borderWidth: theme.borders.thick,
    backgroundColor: theme.colors.orangeLight,
    ...theme.shadows.subtle,
  },
  seatRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.white,
    ...theme.shadows.card,
  },
  seatStep: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.sm,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.offWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  seatCount: { flex: 1, alignItems: "center", gap: 1 },
  disabled: { opacity: 0.4 },
  departureCard: { gap: theme.spacing.md },
  bookingCard: { gap: theme.spacing.md },
  departureHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing.md,
  },
  priceBlock: { alignItems: "flex-end" },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.md },
  meta: { flexDirection: "row", alignItems: "center", gap: theme.spacing.xs },
  referenceRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    padding: theme.spacing.md,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.orangeLight,
  },
  driverRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  cancelRow: { alignItems: "center", paddingTop: theme.spacing.xs },
  noticeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing.xs,
  },
  pill: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 3,
    borderRadius: theme.radius.pill,
  },
  errorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dangerLight,
  },
  loading: {
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xxxl,
  },
  empty: {
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xxl,
  },
  footerLink: { alignItems: "center", paddingVertical: theme.spacing.lg },
});
