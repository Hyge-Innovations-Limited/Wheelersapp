import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";

import {
  RBack,
  RButton,
  RCard,
  RLink,
  RScreen,
  RStepBar,
  RText,
  naira,
  rider,
} from "@/components/rider/kit";
import { PriceCard, PriceCardNote, comparePrice } from "@/components/rider/price-card";
import { getAccessTokenWithRetry } from "@/lib/access-token";
import {
  getRideEstimate,
  isBackendConfigured,
  type RideEstimateResponse,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { resolvePlaceQuery } from "@/lib/google-places";
import { createIdempotencyKey } from "@/lib/idempotency";
import {
  buildInstantRideEstimate,
  parseRideEstimateParam,
  serializeRideEstimate,
} from "@/lib/ride-estimate";
import {
  estimateRide,
  parseRideItineraryParam,
  serializeRideItinerary,
} from "@/lib/ride-route";
import { submitScheduledRide } from "@/lib/scheduled-rides";
import { useWalletOverview } from "@/lib/wallet-overview";

const { colors, fonts } = rider;

function getLiveEstimateFareNgn(estimate: RideEstimateResponse): number | null {
  if (
    typeof estimate.fareEstimateNgn === "number" &&
    Number.isFinite(estimate.fareEstimateNgn)
  ) {
    return estimate.fareEstimateNgn;
  }
  return null;
}

function hasResolvedLiveEstimate(
  estimate: RideEstimateResponse | null,
): estimate is RideEstimateResponse &
  Required<Pick<RideEstimateResponse, "pickup" | "destination" | "route">> {
  return Boolean(estimate?.pickup && estimate.destination && estimate.route);
}

function parseScheduledAtParam(
  value: string | string[] | undefined,
): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string" || raw.trim().length === 0) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function formatScheduledAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "your selected time";
  const dayLabel = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
  const timeLabel = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
  return `${dayLabel}, ${timeLabel}`;
}

function getFullPlaceLabel(location: unknown, fallback: string): string {
  if (location && typeof location === "object") {
    const candidate = location as {
      address?: unknown;
      formattedAddress?: unknown;
      fullAddress?: unknown;
      description?: unknown;
      name?: unknown;
      title?: unknown;
      label?: unknown;
    };

    const values = [
      candidate.fullAddress,
      candidate.formattedAddress,
      candidate.address,
      candidate.description,
      candidate.name,
      candidate.title,
      candidate.label,
    ];

    for (const value of values) {
      if (typeof value === "string" && value.trim().length > 0) {
        return value.trim();
      }
    }
  }

  return fallback.trim();
}

type RouteRowKind = "pickup" | "stop" | "destination";

/**
 * Step 1 of getting a ride: the rider names the price drivers will see.
 *
 * Opened with `scheduledAt`, the same screen confirms a ride for later
 * instead: the pickup time takes the place of the Ride now / Schedule choice
 * and nothing goes to drivers yet.
 */
export default function RideSelectionScreen() {
  const router = useRouter();
  const { getAccessToken, isReady, user } = useAuth();
  const params = useLocalSearchParams<{
    itinerary?: string | string[];
    estimate?: string | string[];
    scheduledAt?: string | string[];
  }>();
  const itinerary = useMemo(
    () => parseRideItineraryParam(params.itinerary),
    [params.itinerary],
  );
  const initialEstimate = useMemo(
    () => parseRideEstimateParam(params.estimate),
    [params.estimate],
  );
  const instantPreview = useMemo(() => estimateRide(itinerary), [itinerary]);
  const fallbackEstimate = useMemo(
    () => buildInstantRideEstimate(itinerary),
    [itinerary],
  );
  const [liveEstimate, setLiveEstimate] = useState<RideEstimateResponse | null>(
    initialEstimate ?? fallbackEstimate,
  );
  const [isEstimateLoading, setIsEstimateLoading] = useState(
    () => isBackendConfigured() && !hasResolvedLiveEstimate(initialEstimate),
  );
  /**
   * What the rider is willing to pay. Wheelers is a bidding market: the fare
   * shown is a suggestion, and the number that actually goes to drivers is
   * this one. It follows the suggestion until the rider touches it, then it
   * is theirs.
   */
  const [offerNgn, setOfferNgn] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const scheduledRideIdempotencyKeyRef = useRef<string | null>(null);
  const serializedItinerary = serializeRideItinerary(itinerary);
  const scheduledAt = useMemo(
    () => parseScheduledAtParam(params.scheduledAt),
    [params.scheduledAt],
  );
  const { overview: wallet } = useWalletOverview();

  // Sync initial estimate only once on mount / when params change.
  // Use serialized string as dep to avoid object-reference churn.
  const serializedEstimateParam = params.estimate
    ? (Array.isArray(params.estimate) ? params.estimate[0] : params.estimate)
    : "";
  useEffect(() => {
    setLiveEstimate(initialEstimate ?? fallbackEstimate);
    setIsEstimateLoading(
      isBackendConfigured() && !hasResolvedLiveEstimate(initialEstimate),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serializedEstimateParam, serializedItinerary]);

  useEffect(() => {
    if (!isBackendConfigured() || !isReady || !user) {
      setIsEstimateLoading(false);
      return;
    }

    const destinationLabel = itinerary.stops[itinerary.stops.length - 1];
    if (!destinationLabel) {
      setIsEstimateLoading(false);
      return;
    }

    let cancelled = false;
    setIsEstimateLoading(true);

    const timeout = setTimeout(async () => {
      try {
        const accessToken = await getAccessTokenWithRetry(getAccessToken);
        if (!accessToken || cancelled) {
          if (!cancelled) setIsEstimateLoading(false);
          return;
        }

        const [pickup, destination, ...stops] = await Promise.all([
          resolvePlaceQuery(itinerary.pickup),
          resolvePlaceQuery(destinationLabel),
          ...itinerary.stops
            .slice(0, -1)
            .map((stop) => resolvePlaceQuery(stop)),
        ]);

        if (cancelled) return;

        const response = await getRideEstimate({
          accessToken,
          pickup,
          destination,
          stops,
        });
        if (!cancelled) {
          setLiveEstimate(response);
          setIsEstimateLoading(false);
        }
      } catch {
        if (!cancelled) setIsEstimateLoading(false);
      }
    }, 50);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
    // Use serialized string to avoid object-reference re-fires
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getAccessToken, isReady, serializedItinerary, user]);

  const resolvedEstimate = hasResolvedLiveEstimate(liveEstimate)
    ? liveEstimate
    : null;
  const liveEstimateFareNgn = liveEstimate
    ? getLiveEstimateFareNgn(liveEstimate)
    : null;
  /** The price Wheelers suggests for this trip: the server's fare for the route. */
  const suggestedNgn =
    liveEstimateFareNgn !== null
      ? liveEstimateFareNgn
      : instantPreview.priceNgn;

  const hasLiveFare = Boolean(resolvedEstimate && liveEstimateFareNgn !== null);
  const isFareResolving = isEstimateLoading && !hasLiveFare;

  // The server's own floor for this trip (the fare at 90% of the recommended
  // rate): an offer under it is refused, so the stepper stops there. Until
  // the live estimate lands, the same share of the preview price.
  const minOfferNgn =
    resolvedEstimate?.minOfferNgn ??
    Math.max(500, Math.ceil((suggestedNgn * 0.9) / 50) * 50);
  const effectiveOfferNgn = Math.max(minOfferNgn, offerNgn ?? suggestedNgn);

  const tripMinutes = resolvedEstimate
    ? Math.max(1, Math.ceil(resolvedEstimate.plannedDurationSeconds / 60))
    : instantPreview.etaMinutes;
  const distanceLabel = resolvedEstimate
    ? `${resolvedEstimate.plannedDistanceKm.toFixed(1)} km`
    : instantPreview.distanceLabel;

  const scheduleSummary = scheduledAt ? formatScheduledAt(scheduledAt) : null;
  const pickupFullAddress = getFullPlaceLabel(
    liveEstimate?.pickup,
    itinerary.pickup,
  );
  const destinationFullAddress = getFullPlaceLabel(
    liveEstimate?.destination,
    itinerary.stops[itinerary.stops.length - 1] ?? "",
  );

  const routeRows = useMemo(() => {
    const rows: { id: string; kind: RouteRowKind; label: string; value: string }[] = [];
    rows.push({ id: "pickup", kind: "pickup", label: "Pickup", value: pickupFullAddress });
    itinerary.stops.slice(0, -1).forEach((stop, index) => {
      rows.push({ id: `stop-${index}`, kind: "stop", label: `Stop ${index + 1}`, value: stop });
    });
    rows.push({
      id: "destination",
      kind: "destination",
      label: "Destination",
      value: destinationFullAddress,
    });
    return rows;
  }, [pickupFullAddress, destinationFullAddress, itinerary.stops]);

  useEffect(() => {
    scheduledRideIdempotencyKeyRef.current = null;
  }, [scheduledAt, serializedItinerary]);

  const estimateParam = serializeRideEstimate(liveEstimate ?? fallbackEstimate);

  const handleEditRoute = () => {
    router.push({
      pathname: "/destination-search",
      // Editing the route of a ride for later keeps it a ride for later.
      params: scheduledAt
        ? { itinerary: serializedItinerary, scheduledAt }
        : { itinerary: serializedItinerary },
    });
  };

  const handleSchedule = () => {
    router.push({
      pathname: "/schedule-ride",
      params: { itinerary: serializedItinerary, estimate: estimateParam },
    });
  };

  const handleBookRide = async () => {
    if (scheduledAt) {
      setIsSubmitting(true);
      try {
        if (!isBackendConfigured() || !isReady || !user) {
          throw new Error(
            "Wheelers backend is not configured for scheduled rides.",
          );
        }
        const destinationLabel = itinerary.stops[itinerary.stops.length - 1];
        if (!destinationLabel)
          throw new Error("Select a destination before scheduling this ride.");

        const accessToken = await getAccessTokenWithRetry(getAccessToken);
        if (!accessToken)
          throw new Error(
            "Could not get an access token to schedule this ride.",
          );

        const pickup =
          liveEstimate?.pickup ?? (await resolvePlaceQuery(itinerary.pickup));
        const destination =
          liveEstimate?.destination ??
          (await resolvePlaceQuery(destinationLabel));
        const stops =
          liveEstimate?.stops ??
          (await Promise.all(
            itinerary.stops.slice(0, -1).map((stop) => resolvePlaceQuery(stop)),
          ));

        await submitScheduledRide({
          getAccessToken: async () => accessToken,
          scheduledFor: scheduledAt,
          idempotencyKey:
            scheduledRideIdempotencyKeyRef.current ??
            (scheduledRideIdempotencyKeyRef.current =
              createIdempotencyKey("scheduled-ride")),
          pickup,
          destination,
          stops,
        });

        router.replace({
          pathname: "/rider/history",
          params: {
            tab: "scheduled",
            toast: `Ride scheduled for ${scheduleSummary ?? "your selected time"}.`,
          },
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Could not schedule this ride.";
        Alert.alert("Schedule failed", message);
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    router.push({
      pathname: "/matching",
      params: {
        itinerary: serializedItinerary,
        estimate: estimateParam,
        offer: String(effectiveOfferNgn),
      },
    });
  };

  const balanceNgn = typeof wallet?.balanceNgn === "number" ? wallet.balanceNgn : null;
  const shortNgn =
    balanceNgn !== null && !scheduledAt ? Math.ceil(effectiveOfferNgn - balanceNgn) : 0;
  const comparison = comparePrice(effectiveOfferNgn, suggestedNgn, "the suggested price");

  return (
    <RScreen contentStyle={styles.screen}>
      <StatusBar style="dark" backgroundColor={colors.cream} />

      <View style={styles.header}>
        <RBack />
        <RText variant="title" style={styles.title}>
          {scheduledAt ? "Schedule ride" : "Set your price"}
        </RText>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={styles.scroll}>
        {scheduledAt ? null : <RStepBar active={1} />}

        <RCard style={styles.routeCard}>
          <View style={styles.routeRows}>
            {routeRows.map((row, index) => (
              <View key={row.id} style={styles.routeRow}>
                <View style={styles.routeRail}>
                  <View
                    style={[
                      styles.routeDot,
                      row.kind === "pickup"
                        ? styles.routeDotPickup
                        : row.kind === "stop"
                          ? styles.routeDotStop
                          : styles.routeDotDestination,
                    ]}
                  />
                  {index < routeRows.length - 1 ? <View style={styles.routeLine} /> : null}
                </View>
                <View style={styles.routeText}>
                  <RText variant="caption" style={styles.routeLabel}>
                    {row.label}
                  </RText>
                  <RText variant="bodyBold" numberOfLines={2}>
                    {row.value || "Not set"}
                  </RText>
                </View>
              </View>
            ))}
          </View>
          <RLink
            accessibilityLabel="Edit route"
            color={colors.orangeText}
            onPress={handleEditRoute}
            style={styles.routeEdit}
            title="Edit"
          />
        </RCard>

        <View style={styles.chips}>
          <View style={styles.chip}>
            <RText variant="smallBold">{distanceLabel}</RText>
          </View>
          <View style={styles.chip}>
            <RText variant="smallBold">About {tripMinutes} min</RText>
          </View>
        </View>

        {scheduledAt ? (
          <>
            <RCard tone="ink" style={styles.estimateCard}>
              <RText variant="small" color={colors.onInkMuted}>
                {isFareResolving ? "Checking the price for this route" : "Suggested price"}
              </RText>
              <RText variant="figure" color={colors.orange} style={styles.estimateFigure}>
                {naira(suggestedNgn)}
              </RText>
            </RCard>

            <RCard style={styles.infoCard}>
              <Ionicons color={colors.ink} name="calendar-outline" size={24} />
              <View style={styles.infoText}>
                <RText variant="bodyBold">Pickup time</RText>
                <RText variant="small" color={colors.muted}>
                  {scheduleSummary}
                </RText>
              </View>
            </RCard>
          </>
        ) : (
          <>
            <PriceCard
              amountNgn={effectiveOfferNgn}
              label="Your offer"
              minNgn={minOfferNgn}
              onChange={setOfferNgn}
              sideLabel="Suggested price"
              sideValue={naira(suggestedNgn)}>
              {comparison ? <PriceCardNote strong>{comparison}</PriceCardNote> : null}
              <PriceCardNote>
                {isFareResolving
                  ? "Checking the price for this route."
                  : effectiveOfferNgn <= minOfferNgn
                    ? "This is the minimum offer for this trip."
                    : `Minimum offer: ${naira(minOfferNgn)}`}
              </PriceCardNote>
            </PriceCard>

            <View style={styles.whenRow}>
              <View
                accessibilityLabel="Ride now, selected"
                accessible
                style={[styles.when, styles.whenOn]}>
                <RText variant="smallBold" color={colors.cream} style={styles.whenText}>
                  Ride now
                </RText>
              </View>
              <Pressable
                accessibilityLabel="Schedule this ride for later"
                accessibilityRole="button"
                onPress={handleSchedule}
                style={({ pressed }) => [styles.when, styles.whenOff, pressed ? styles.pressed : null]}>
                <Ionicons color={colors.ink} name="calendar-outline" size={17} />
                <RText variant="smallBold" style={styles.whenText}>
                  Schedule
                </RText>
              </Pressable>
            </View>
          </>
        )}

        {balanceNgn !== null ? (
          <RCard style={styles.infoCard}>
            <Ionicons color={colors.ink} name="wallet-outline" size={24} />
            <View style={styles.infoText}>
              <RText variant="bodyBold">Pay from wallet</RText>
              <RText variant="small" color={colors.muted} style={styles.tabular}>
                {shortNgn > 0
                  ? `Balance ${naira(balanceNgn)}. Add ${naira(shortNgn)} to pay for this trip.`
                  : `Balance ${naira(balanceNgn)}`}
              </RText>
            </View>
            {shortNgn > 0 ? (
              <RLink
                color={colors.orangeText}
                onPress={() => router.push("/rider/wallet")}
                title="Add money"
              />
            ) : null}
          </RCard>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        {scheduledAt ? null : (
          <RText variant="small" color={colors.muted} style={styles.footnote}>
            This is the total price. No extra charges.
          </RText>
        )}
        <RButton
          // Until the server's price for this route is in, the figure is a
          // guess that may be under the minimum: nothing is sent at a guess.
          disabled={isFareResolving}
          loading={isSubmitting}
          onPress={() => void handleBookRide()}
          title={scheduledAt ? "Schedule ride" : `Find drivers at ${naira(effectiveOfferNgn)}`}
        />
      </View>
    </RScreen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: rider.gutter, paddingTop: 12, paddingBottom: 16 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingBottom: 12 },
  title: { flex: 1, fontSize: 26, lineHeight: 30 },
  scroll: { flex: 1 },
  body: { gap: 14, paddingBottom: 16 },

  routeCard: { flexDirection: "row", gap: 8, paddingVertical: 14, borderRadius: 20 },
  routeRows: { flex: 1, minWidth: 0 },
  routeRow: { flexDirection: "row", gap: 14 },
  routeRail: { width: 12, alignItems: "center", paddingTop: 6 },
  routeDot: { width: 12, height: 12 },
  routeDotPickup: { borderRadius: 6, backgroundColor: colors.ink },
  routeDotStop: { borderRadius: 6, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.card },
  routeDotDestination: { borderRadius: 3, backgroundColor: colors.orange },
  routeLine: { flex: 1, width: 2, minHeight: 14, marginVertical: 4, backgroundColor: colors.line },
  routeText: { flex: 1, minWidth: 0, paddingBottom: 10 },
  routeLabel: { fontFamily: fonts.regular },
  routeEdit: { alignSelf: "center" },

  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: rider.radius.pill,
    backgroundColor: colors.tint,
  },

  estimateCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: 18,
  },
  estimateFigure: { fontSize: 36, lineHeight: 40 },

  whenRow: { flexDirection: "row", gap: 10 },
  when: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  whenOn: { backgroundColor: colors.ink },
  whenOff: { borderWidth: 2, borderColor: colors.ink },
  whenText: { fontSize: 15 },

  infoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderRadius: rider.radius.lg,
  },
  infoText: { flex: 1, minWidth: 0 },
  tabular: { fontVariant: ["tabular-nums"] },

  footer: { gap: 10, paddingTop: 8 },
  footnote: { textAlign: "center" },
  pressed: { opacity: 0.72 },
});
