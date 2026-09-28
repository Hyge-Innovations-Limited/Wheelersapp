import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef } from "react";
import { StyleSheet, View } from "react-native";

import { AppButton } from "@/components/app-button";
import { AppCard } from "@/components/app-card";
import { AppScreen } from "@/components/app-screen";
import { AppText } from "@/components/app-text";
import { EmergencyButton } from "@/components/emergency-button";
import { BackArrow } from "@/components/back-arrow";
import { LiveMap } from "@/components/live-map";
import { MetricCard } from "@/components/MetricCard";
import { TripCallButton } from "@/components/TripCallButton";
import { TripChatButton } from "@/components/TripChatButton";
import { RideMovementBar } from "@/components/RideMovementBar";
import { StatusPill } from "@/components/StatusPill";
import { TripProgressBar } from "@/components/TripProgressBar";
import { estimateEtaMinutes } from "@/lib/geo";
import { useAppLocation } from "@/lib/location";
import {
  getAdditionalStopCount,
  getRideRouteRows,
  parseRideItineraryParam,
  serializeRideItinerary,
} from "@/lib/ride-route";
import { useRideSession } from "@/lib/ride-session";
import { theme } from "@/theme";

function formatRideFare(params: {
  ngn?: number;
}): string | null {
  if (typeof params.ngn === "number" && Number.isFinite(params.ngn)) {
    return `NGN ${Math.round(params.ngn).toLocaleString("en-NG")}`;
  }

  return null;
}

export default function RiderActiveTripScreen() {
  const router = useRouter();
  const { backgroundGranted, requestBackgroundLocationAccess } = useAppLocation();
  const params = useLocalSearchParams<{
    itinerary?: string | string[];
  }>();
  const fallbackItinerary = useMemo(
    () => parseRideItineraryParam(params.itinerary),
    [params.itinerary],
  );
  const { cancelRide, currentRide, chatMessages, sendChatMessage } = useRideSession();
  const itinerary = currentRide?.itinerary ?? fallbackItinerary;
  const routeRows = useMemo(() => getRideRouteRows(itinerary), [itinerary]);
  const extraStops = getAdditionalStopCount(itinerary);
  const serializedItinerary = serializeRideItinerary(itinerary);
  const backgroundPromptedRef = useRef(false);
  const nextStop =
    currentRide?.driverLocation?.nextStopAddress ??
    routeRows[1]?.value ??
    itinerary.stops[0];
  const statusLabel =
    currentRide?.status === "active"
      ? "TRIP IN PROGRESS"
      : currentRide?.status === "completed"
        ? "TRIP COMPLETED"
        : currentRide?.status === "matched"
          ? "DRIVER EN ROUTE"
          : currentRide?.status === "matching"
            ? "MATCHING DRIVER"
            : "TRIP UPDATE";
  const statusText =
    currentRide?.status === "active"
      ? "Live trip in progress"
      : currentRide?.status === "completed"
        ? "Ride completed"
        : currentRide?.status === "matched"
          ? "Driver heading to your pickup"
          : currentRide?.status === "matching"
            ? "Waiting for a driver to accept"
            : "Trip status unavailable";
  const metrics = [
    {
      id: "eta",
      label: currentRide?.status === "completed" ? "MIN TRIP" : "MIN LEFT",
      // Live first: distanceToNextStopKm arrives with every driver GPS update,
      // so the ETA ticks down as the driver moves — the static etaSeconds from
      // matching is only the opening value.
      value: String(
        typeof currentRide?.driverLocation?.distanceToNextStopKm === "number" &&
          currentRide?.status !== "completed"
          ? estimateEtaMinutes(currentRide.driverLocation.distanceToNextStopKm)
          : currentRide?.driver?.etaSeconds
            ? Math.max(1, Math.ceil(currentRide.driver.etaSeconds / 60))
            : currentRide?.plannedDurationSeconds
              ? Math.max(1, Math.ceil(currentRide.plannedDurationSeconds / 60))
              : "--",
      ),
      accent: "orange" as const,
    },
    {
      id: "distance",
      label: currentRide?.status === "completed" ? "KM TRIP" : "KM LEFT",
      value:
        typeof currentRide?.driverLocation?.distanceToNextStopKm === "number"
          ? currentRide.driverLocation.distanceToNextStopKm.toFixed(1)
          : typeof currentRide?.plannedDistanceKm === "number"
            ? currentRide.plannedDistanceKm.toFixed(1)
            : "--",
    },
    {
      id: "fare",
      label: currentRide?.status === "completed" ? "FARE PAID" : "FARE",
      value:
        formatRideFare({
          ngn:
            currentRide?.completedFareNgn ??
            currentRide?.driver?.lockedFareNgn ??
            currentRide?.fareEstimateNgn,
        }) ?? "Fare pending",
    },
  ];

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

  async function handleCancelRide() {
    try {
      await cancelRide("rider_cancelled");
    } finally {
      router.replace("/rider");
    }
  }

  return (
    <AppScreen
      backgroundColor={theme.colors.offWhite}
      contentStyle={styles.container}
    >
      <StatusBar style="dark" backgroundColor={theme.colors.mapBase} />
      <View style={styles.mapWrap}>
        <LiveMap
          height={260}
          pickup={currentRide?.route?.pickup}
          destination={currentRide?.route?.destination}
          stops={currentRide?.route?.stops}
          route={currentRide?.route?.route}
          driverLocation={currentRide?.driverLocation}
          initialCenter={currentRide?.route?.pickup}
          fitPadding={{ top: 40, right: 28, bottom: 44, left: 28 }}
        >
          <BackArrow onPress={() => router.back()} style={styles.backButton} />
          <View style={styles.liveBadge}>
            <AppText variant="monoSmall" color={theme.colors.offWhite}>
              LIVE
            </AppText>
          </View>
        </LiveMap>
      </View>

      <View style={styles.content}>
        <View style={styles.statusRow}>
          <StatusPill label={statusLabel} variant="dark" />
          <AppText variant="monoSmall" color={theme.colors.muted}>
            ● {statusText}
          </AppText>
        </View>

        <TripProgressBar
          progress={
            currentRide?.status === "completed"
              ? 1
              : currentRide?.status === "active"
                ? 0.62
                : currentRide?.status === "matched"
                  ? 0.28
                  : 0.14
          }
        />

        <RideMovementBar
          distanceToNextStopKm={currentRide?.driverLocation?.distanceToNextStopKm}
          totalDistanceKm={currentRide?.driverLocation?.totalDistanceKm}
          plannedDistanceKm={currentRide?.plannedDistanceKm}
          nextStopAddress={currentRide?.driverLocation?.nextStopAddress}
          isStale={currentRide?.driverLocation?.isStale}
        />

        <View style={styles.metricsRow}>
          {metrics.map((metric) => (
            <MetricCard
              accent={metric.accent}
              key={metric.id}
              label={metric.label}
              style={styles.metric}
              value={metric.value}
            />
          ))}
        </View>

        <AppCard style={styles.bannerCard}>
          <View style={styles.bannerTopRow}>
            <View style={styles.bannerCopy}>
              <AppText variant="monoSmall" color={theme.colors.muted}>
                {currentRide?.status === "matched" ? "DRIVER NEXT STOP" : "HEADING TO"}
              </AppText>
              <AppText variant="bodyMedium">{nextStop}</AppText>
            </View>
            <AppButton
              title="Add or change"
              variant="ghost"
              disabled={currentRide?.status === "completed"}
              onPress={() =>
                router.push({
                  pathname: "/destination-search",
                  params: {
                    flowMode: "trip-edit",
                    itinerary: serializedItinerary,
                  },
                })
              }
              style={styles.editButton}
            />
          </View>
          <AppText variant="bodySmall" color={theme.colors.muted}>
            {extraStops > 0
              ? `${extraStops} extra stop${extraStops === 1 ? "" : "s"} still in this trip.`
              : "No extra stops added to this trip."}
          </AppText>
        </AppCard>

        <AppCard style={styles.routeCard}>
          {routeRows.map((row) => (
            <StopRow key={row.id} kind={row.kind} label={row.value} />
          ))}
        </AppCard>

        {/* The emergency button only means anything while the trip is live —
            and while it is, it reaches our safety team rather than a mock
            screen, which is all the old SOS button did. */}
        <View style={styles.actions}>
          <View style={styles.sosSlot}>
            <EmergencyButton role="RIDER" rideId={currentRide?.rideId ?? null} />
          </View>
          <AppButton
            title="Share trip ↗"
            variant="ghost"
            style={styles.shareButton}
          />
        </View>

        <AppButton
          title={
            currentRide?.status === "completed"
              ? "Rate trip ↗"
              : currentRide?.status === "active"
                ? "Waiting for completion"
                : "Driver en route"
          }
          disabled={currentRide?.status !== "completed"}
          onPress={() => router.push("/rider/trip-rating")}
        />

        {currentRide?.status !== "completed" ? (
          <AppButton
            title="Cancel ride"
            variant="danger"
            onPress={handleCancelRide}
          />
        ) : null}
      </View>

      {/* Open from the match until 30 minutes after the trip; the server says when it has closed. */}
      {currentRide && (currentRide.status === "active" || currentRide.status === "matched" || currentRide.status === "completed") && (
        <TripChatButton
          rideId={currentRide.rideId}
          role="RIDER"
          messages={chatMessages}
          onSend={sendChatMessage}
          otherName={currentRide.driver?.driverName}
          variant="fab"
          style={styles.chatFab}
        />
      )}
      {currentRide && (currentRide.status === "active" || currentRide.status === "matched") && (
        <TripCallButton
          rideId={currentRide.rideId}
          otherRole="DRIVER"
          otherName={currentRide.driver?.driverName}
          variant="fab"
          style={styles.callFab}
        />
      )}
    </AppScreen>
  );
}

function StopRow({
  kind,
  label,
}: {
  kind: "pickup" | "stop" | "destination";
  label: string;
}) {
  return (
    <View style={styles.stopRow}>
      <View
        style={[
          styles.stopDot,
          kind === "pickup"
            ? styles.stopDotPickup
            : kind === "destination"
              ? styles.stopDotDestination
              : styles.stopDotStop,
        ]}
      />
      <AppText variant="bodyMedium">{label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  sosSlot: { flex: 1 },
  container: {
    flex: 1,
    paddingHorizontal: 0,
    paddingBottom: theme.spacing.xl,
  },
  mapWrap: {
    borderBottomWidth: theme.borders.thick,
    borderBottomColor: theme.colors.black,
  },
  backButton: {
    position: "absolute",
    top: 12,
    left: theme.spacing.gutter,
  },
  liveBadge: {
    position: "absolute",
    top: 12,
    right: theme.spacing.gutter,
    minWidth: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 5,
    borderRadius: theme.radius.sm,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.black,
    ...theme.shadows.card,
  },
  content: {
    flex: 1,
    paddingHorizontal: theme.spacing.gutter,
    paddingTop: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  metricsRow: {
    flexDirection: "row",
    gap: theme.spacing.sm,
  },
  metric: {
    minHeight: 86,
  },
  bannerCard: {
    gap: theme.spacing.sm,
  },
  bannerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  bannerCopy: {
    flex: 1,
    gap: 2,
  },
  editButton: {
    width: 140,
  },
  routeCard: {
    gap: theme.spacing.sm,
  },
  stopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  stopDot: {
    width: 10,
    height: 10,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.black,
  },
  stopDotPickup: {
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.green,
  },
  stopDotStop: {
    borderRadius: 3,
    backgroundColor: "#FFD1B5",
  },
  stopDotDestination: {
    borderRadius: 3,
    backgroundColor: theme.colors.orange,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  shareButton: {
    flex: 1,
  },
  callFab: {
    position: "absolute",
    bottom: 92,
    right: theme.spacing.gutter,
  },
  chatFab: {
    position: "absolute",
    bottom: 24,
    right: theme.spacing.gutter,
    width: 56,
    height: 56,
    borderRadius: theme.radii.pill,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.orange,
    alignItems: "center",
    justifyContent: "center",
    ...theme.shadows.card,
  },
});
