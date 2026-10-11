import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { RBack, RButton, RCard, RLink, RScreen, RText, naira, rider } from "@/components/rider/kit";
import { rebookParams, useRide, type RideDetail } from "@/lib/rider-trips";
import { cancelWords, parseDate, receiptDateWords, routeWords, tripLengthWords } from "@/lib/trip-words";

const { colors, fonts } = rider;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function amount(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** "Tunde Ade · LAG-482-XY", either half alone, or null with no driver. */
function driverWords(driver: RideDetail["driver"]): string | null {
  if (!driver) return null;
  const parts = [driver.name?.trim(), driver.vehiclePlate?.trim()].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** "Toyota Corolla", or null when the server has neither. */
function carWords(driver: RideDetail["driver"]): string | null {
  if (!driver) return null;
  const parts = [driver.vehicleMake?.trim(), driver.vehicleModel?.trim()].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : null;
}

function paidWithWords(method: string | null): string | null {
  if (method === "wallet_balance") return "Wallet";
  return null;
}

export default function TripReceiptScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ rideId?: string | string[] }>();
  const rideId = first(params.rideId)?.trim() || null;
  const { ride, isLoading, error, reload } = useRide(rideId);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/rider/history" as Href);
  };

  if (!ride) {
    return (
      <RScreen contentStyle={styles.screen}>
        <StatusBar style="dark" />
        <RBack onPress={goBack} />
        <View style={styles.center}>
          {isLoading ? (
            <>
              <ActivityIndicator accessibilityLabel="Loading this trip" color={colors.ink} />
              <RText color={colors.muted} variant="small">
                Loading this trip
              </RText>
            </>
          ) : (
            <>
              <Ionicons color={colors.danger} name="cloud-offline-outline" size={32} />
              <RText style={styles.centerText} variant="heading">
                We could not load this trip
              </RText>
              <RText color={colors.muted} style={styles.centerText} variant="small">
                {error ?? "Please try again."}
              </RText>
              {rideId ? (
                <RButton
                  accessibilityLabel="Try again"
                  onPress={() => void reload()}
                  size="md"
                  style={styles.stretch}
                  title="Try again"
                  variant="ghost"
                />
              ) : null}
              <RLink accessibilityLabel="Back to Trips" onPress={goBack} title="Back to Trips" />
            </>
          )}
        </View>
      </RScreen>
    );
  }

  const cancelled = ride.status === "CANCELLED";
  const completed = ride.status === "COMPLETED";
  const when = parseDate(ride.completedAt ?? ride.cancelledAt ?? ride.createdAt);
  const paid = amount(ride.fareFinalNgn) ?? amount(ride.agreedFareNgn);
  const penalty = amount(ride.penaltyNgn);
  const via = ride.stops
    .filter((stop) => stop.type === "INTERMEDIATE")
    .sort((a, b) => a.order - b.order)
    .map((stop) => stop.address);
  const paidWith = paidWithWords(ride.paymentMethod);

  const rows: { label: string; value: string }[] = [];
  const add = (label: string, value: string | null | undefined) => {
    if (value && value.trim().length > 0) rows.push({ label, value: value.trim() });
  };
  add("Pickup", ride.pickup.address);
  via.forEach((address, index) => add(via.length === 1 ? "Stop" : `Stop ${index + 1}`, address));
  add("Destination", ride.destination.address);
  add("Distance and time", tripLengthWords(ride.distanceKm, ride.durationSeconds));
  add("Driver", driverWords(ride.driver));
  add("Car", carWords(ride.driver));
  if (cancelled && penalty !== null && penalty > 0) add("Cancellation fee", naira(penalty));
  // A cancelled ride with no fee was not paid for with anything.
  if (!cancelled || (penalty !== null && penalty > 0)) add("Paid with", paidWith);
  add("Trip number", ride.tripId);

  const rebook = (direction: "same" | "reverse") => {
    const rebookWith = rebookParams(
      { pickupAddress: ride.pickup.address, destAddress: ride.destination.address, via },
      direction,
    );
    if (!rebookWith) return;
    router.push({ pathname: "/ride-selection", params: rebookWith } as Href);
  };

  return (
    <RScreen bounces contentStyle={styles.screen} scroll>
      <StatusBar style="dark" />
      <RBack onPress={goBack} />

      <View style={styles.head}>
        {when ? (
          <RText color={colors.muted} variant="small">
            {receiptDateWords(when)}
          </RText>
        ) : null}
        <RText accessibilityRole="header" style={styles.title} variant="title">
          {routeWords(ride.pickup.address, ride.destination.address)}
        </RText>
      </View>

      {cancelled ? (
        <RCard style={styles.cancelled} tone="card">
          <View style={styles.cancelledHead}>
            <Ionicons color={colors.danger} name="close-circle" size={22} />
            <RText color={colors.danger} variant="bodyBold">
              Ride cancelled
            </RText>
          </View>
          <RText color={colors.ink} variant="small">
            {cancelWords(ride.cancelReason)}
          </RText>
        </RCard>
      ) : paid !== null ? (
        <RCard style={styles.total} tone="ink">
          <View style={styles.totalWords}>
            <RText color={colors.onInkMuted} variant="small">
              {completed ? "Total paid" : "Agreed price"}
            </RText>
            {completed ? (
              <RText color={colors.onInkMuted} style={styles.totalNote}>
                Includes VAT and service charge
              </RText>
            ) : null}
          </View>
          <RText adjustsFontSizeToFit color={colors.orange} numberOfLines={1} style={styles.totalFigure} variant="figure">
            {naira(paid)}
          </RText>
        </RCard>
      ) : null}

      {rows.length > 0 ? (
        <RCard style={styles.rows} tone="card">
          {rows.map((row, index) => (
            <View
              accessibilityLabel={`${row.label}: ${row.value}`}
              accessible
              key={row.label}
              style={[styles.row, index === rows.length - 1 ? null : styles.rowDivider]}>
              <RText color={colors.muted} style={styles.rowLabel}>
                {row.label}
              </RText>
              <RText selectable={row.label === "Trip number"} style={styles.rowValue}>
                {row.value}
              </RText>
            </View>
          ))}
        </RCard>
      ) : null}

      <View style={styles.actions}>
        <RButton
          accessibilityLabel="Book this ride again"
          onPress={() => rebook("same")}
          size="md"
          style={styles.action}
          title="Book again"
        />
        <RButton
          accessibilityLabel="Book this ride the other way round"
          onPress={() => rebook("reverse")}
          size="md"
          style={styles.action}
          title="Reverse it"
          variant="ghost"
        />
      </View>

      <View style={styles.spacer} />
      <RLink
        accessibilityLabel="Report a problem with this trip"
        color={colors.muted}
        onPress={() => router.push("/support/chat" as Href)}
        title="Report a problem with this trip"
      />
    </RScreen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: 10, gap: 14 },
  head: { gap: 4 },
  title: { fontSize: 30, lineHeight: 33 },
  spacer: { flexGrow: 1 },
  stretch: { alignSelf: "stretch", marginTop: 8 },

  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 32 },
  centerText: { textAlign: "center" },

  total: { padding: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  totalWords: { flex: 1, minWidth: 0, gap: 2 },
  totalNote: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 17 },
  totalFigure: { fontSize: 38, lineHeight: 42, flexShrink: 0, maxWidth: "60%" },

  cancelled: { borderColor: colors.danger, borderWidth: 2, backgroundColor: colors.dangerSoft, gap: 6 },
  cancelledHead: { flexDirection: "row", alignItems: "center", gap: 8 },

  rows: { paddingVertical: 4, paddingHorizontal: 16, borderRadius: 20 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 16, paddingVertical: 10 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.line },
  rowLabel: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, flexShrink: 0 },
  rowValue: { flex: 1, textAlign: "right", fontFamily: fonts.bold, fontSize: 15, lineHeight: 21 },

  actions: { flexDirection: "row", gap: 10 },
  action: { flex: 1 },
});
