import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/lib/auth";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Dimensions,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { AppButton } from "@/components/app-button";
import { AppScreen } from "@/components/app-screen";
import { AppText } from "@/components/app-text";
import { BackArrow } from "@/components/back-arrow";
import { LiveMap } from "@/components/live-map";
import { FloatingView } from "@/components/motion";
import { getAccessTokenWithRetry } from "@/lib/access-token";
import {
  getRideEstimate,
  isBackendConfigured,
  type RideEstimateResponse,
} from "@/lib/api";
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
import { theme } from "@/theme";

const { height } = Dimensions.get("window");
type RideTier = "basic" | "premium";

function getLiveEstimateFareNgn(estimate: RideEstimateResponse): number | null {
  if (
    typeof estimate.fareEstimateNgn === "number" &&
    Number.isFinite(estimate.fareEstimateNgn)
  ) {
    return estimate.fareEstimateNgn;
  }
  return null;
}

function formatNgn(value: number): string {
  return `NGN ${Math.round(value).toLocaleString("en-NG")}`;
}

function formatCompactNgn(value: number): string {
  return Math.round(value).toLocaleString("en-NG");
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

function CarArtwork({
  accentColor,
  highlightColor,
}: {
  accentColor: string;
  highlightColor: string;
}) {
  return (
    <View style={styles.vehicleArtwork}>
      <View style={styles.evWrap}>
        <View style={[styles.evBody, { backgroundColor: accentColor }]}>
          <View style={styles.evCabin} />
          <View style={styles.evWindow} />
          <View
            style={[styles.evBolt, { backgroundColor: theme.colors.white }]}
          />
          <View style={[styles.evLight, styles.evHeadlight]} />
          <View style={[styles.evLight, styles.evTaillight]} />
        </View>
        <View style={[styles.evWheel, styles.evWheelLeft]}>
          <View style={styles.evWheelHub} />
        </View>
        <View style={[styles.evWheel, styles.evWheelRight]}>
          <View style={styles.evWheelHub} />
        </View>
      </View>
      <View style={[styles.rideTierBadge, { backgroundColor: highlightColor }]}>
        <AppText variant="monoSmall">
          {accentColor === theme.colors.orange ? "B" : "P"}
        </AppText>
      </View>
    </View>
  );
}

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
  const [isExpanded, setIsExpanded] = useState(true);
  const [selectedRideTier, setSelectedRideTier] = useState<RideTier>("basic");
  /**
   * What the rider is willing to pay. Wheelers is a bidding market: the fare
   * shown is an estimate, and the number that actually goes to drivers is this
   * one. It follows the estimate until the rider touches it, then it is theirs.
   */
  const [offerNgn, setOfferNgn] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const scheduledRideIdempotencyKeyRef = useRef<string | null>(null);
  const sheetOffset = useSharedValue(0);
  const serializedItinerary = serializeRideItinerary(itinerary);
  const scheduledAt = useMemo(
    () => parseScheduledAtParam(params.scheduledAt),
    [params.scheduledAt],
  );

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

  const SHEET_MIN_HEIGHT = 260;
  const routeFitPadding = {
    top: 188,
    right: 56,
    bottom: SHEET_MIN_HEIGHT + 36,
    left: 56,
  };

  const expandSheet = () => {
    setIsExpanded(true);
    sheetOffset.value = withTiming(0, { duration: 220 });
  };

  const collapseSheet = () => {
    setIsExpanded(false);
    sheetOffset.value = withTiming(0, { duration: 220 });
  };

  // Pan responder ONLY for the handle pill — does not interfere with ScrollView
  const handlePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) =>
        Math.abs(gestureState.dy) > 5,
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy < -20) {
          expandSheet();
        } else if (gestureState.dy > 20) {
          collapseSheet();
        }
      },
      onPanResponderTerminate: (_, gestureState) => {
        if (gestureState.dy < -20) {
          expandSheet();
        } else if (gestureState.dy > 20) {
          collapseSheet();
        }
      },
    }),
  ).current;

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetOffset.value }],
  }));

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
  const baseFareNgn =
    liveEstimateFareNgn !== null
      ? liveEstimateFareNgn
      : instantPreview.priceNgn;

  const rideOptions = useMemo(
    () => [
      {
        id: "basic" as const,
        label: "Basic",
        subtitle: scheduledAt
          ? "Reliable everyday ride for your scheduled trip"
          : "Affordable everyday ride for this route",
        accentColor: theme.colors.orange,
        badgeColor: "#FFD7BF",
        etaMinutes: resolvedEstimate
          ? Math.max(1, Math.ceil(resolvedEstimate.plannedDurationSeconds / 60))
          : instantPreview.etaMinutes,
        fareNgn: baseFareNgn,
      },
      {
        id: "premium" as const,
        label: "Premium",
        subtitle: scheduledAt
          ? "Polished ride with a more premium feel"
          : "Extra-comfort option with a cleaner premium feel",
        accentColor: "#1F2948",
        badgeColor: "#DDE7FF",
        etaMinutes: resolvedEstimate
          ? Math.max(
              1,
              Math.ceil(resolvedEstimate.plannedDurationSeconds / 60) - 1,
            )
          : Math.max(1, instantPreview.etaMinutes - 1),
        fareNgn: Math.round(baseFareNgn * 1.24),
      },
    ],
    [baseFareNgn, instantPreview.etaMinutes, resolvedEstimate, scheduledAt],
  );

  const selectedRideOption =
    rideOptions.find((option) => option.id === selectedRideTier) ??
    rideOptions[0];

  // Switching tier re-anchors the offer to that tier's estimate; carrying a
  // Basic price over to Premium would silently under-bid the trip.
  useEffect(() => {
    setOfferNgn(null);
  }, [selectedRideTier]);

  const hasLiveFare = Boolean(resolvedEstimate && liveEstimateFareNgn !== null);
  const isFareResolving = isEstimateLoading && !hasLiveFare;
  const displayEtaLabel = `${selectedRideOption.etaMinutes} min trip`;
  const displayDistanceLabel = resolvedEstimate
    ? `${resolvedEstimate.plannedDistanceKm.toFixed(1)} km route`
    : instantPreview.distanceLabel;
  const displayFareLabel = isFareResolving
    ? "Estimating"
    : formatNgn(selectedRideOption.fareNgn);
  const scheduleSummary = scheduledAt ? formatScheduledAt(scheduledAt) : null;
  const pickupFullAddress = getFullPlaceLabel(
    liveEstimate?.pickup,
    itinerary.pickup,
  );
  const destinationFullAddress = getFullPlaceLabel(
    liveEstimate?.destination,
    itinerary.stops[itinerary.stops.length - 1] ?? "",
  );
  const effectiveOfferNgn = offerNgn ?? selectedRideOption.fareNgn;
  // The server's own floor for this trip (the fare at 90% of the recommended
  // rate): an offer under it is refused, so the stepper stops there. Until
  // the live estimate lands, the same share of the preview price.
  const minOfferNgn =
    resolvedEstimate?.minOfferNgn && selectedRideOption.id === "basic"
      ? resolvedEstimate.minOfferNgn
      : Math.max(500, Math.ceil((selectedRideOption.fareNgn * 0.9) / 50) * 50);

  const adjustOffer = (delta: number) => {
    void Haptics.selectionAsync();
    setOfferNgn((current) =>
      Math.max(minOfferNgn, (current ?? selectedRideOption.fareNgn) + delta),
    );
  };

  const canBookRide = !isSubmitting;

  const routeRows = useMemo(() => {
    const rows: Array<{ id: string; kind: "pickup" | "stop" | "destination"; label: string; value: string }> = [];
    rows.push({
      id: "pickup",
      kind: "pickup",
      label: "Pickup",
      value: pickupFullAddress,
    });
    const intermediateStops = itinerary.stops.slice(0, -1);
    intermediateStops.forEach((stop, index) => {
      rows.push({
        id: `stop-${index}`,
        kind: "stop",
        label: `Stop ${index + 1}`,
        value: stop,
      });
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

  const handleEditRoute = () => {
    router.push({
      pathname: "/destination-search",
      params: { itinerary: serializedItinerary },
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
        estimate: serializeRideEstimate(liveEstimate ?? fallbackEstimate),
        offer: String(effectiveOfferNgn),
      },
    });
  };

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
          pickup={liveEstimate?.pickup}
          destination={liveEstimate?.destination}
          stops={liveEstimate?.stops}
          route={liveEstimate?.route}
          initialCenter={liveEstimate?.pickup}
          fitPadding={routeFitPadding}
        >
          <View style={styles.topBar}>
            <BackArrow onPress={() => router.back()} />
            <View style={styles.mapTopInfoStack}>
              <FloatingView distance={5}>
                <View style={styles.mapChip}>
                  <AppText variant="monoSmall">
                    Wheeler • {displayEtaLabel}
                  </AppText>
                </View>
              </FloatingView>

              <FloatingView distance={4}>
                <MapRouteSummary
                  pickup={pickupFullAddress}
                  destination={destinationFullAddress}
                  onEdit={handleEditRoute}
                />
              </FloatingView>
            </View>
          </View>

          <FloatingView style={styles.priceBadge} distance={6}>
            <View style={styles.priceBadgeInner}>
              <AppText variant="monoLarge">{displayFareLabel}</AppText>
            </View>
          </FloatingView>
        </LiveMap>
      </View>

      <Animated.View
        style={[
          styles.sheet,
          isExpanded ? styles.sheetExpanded : styles.sheetCollapsed,
          sheetAnimatedStyle,
        ]}
      >
        {/* Handle pill — only this area controls drag expand/collapse */}
        <View style={styles.handleArea} {...handlePanResponder.panHandlers}>
          <View style={styles.handle} />
        </View>

        {isExpanded ? (
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.sheetScrollContent}
          >
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeaderText}>
                <AppText variant="monoSmall" color={theme.colors.orange}>
                  {scheduledAt ? "SCHEDULED RIDE" : "RIDE OPTION"}
                </AppText>
                <AppText variant="h3">Wheeler</AppText>
                <AppText variant="bodySmall" color={theme.colors.muted}>
                  {scheduledAt
                    ? `Scheduled for ${scheduleSummary ?? "your selected time"}`
                    : "Choose your ride style for this route."}
                </AppText>
              </View>
              <View style={styles.rideIcon}>
                <CarArtwork
                  accentColor={selectedRideOption.accentColor}
                  highlightColor={selectedRideOption.badgeColor}
                />
              </View>
            </View>

            <RideOptionList
              rideOptions={rideOptions}
              selectedRideTier={selectedRideTier}
              setSelectedRideTier={setSelectedRideTier}
              displayDistanceLabel={displayDistanceLabel}
              isFareResolving={isFareResolving}
            />

            <View style={styles.routeBox}>
              <View style={styles.routeBoxHeader}>
                <AppText variant="monoSmall" color={theme.colors.muted}>
                  ROUTE
                </AppText>
                <Pressable
                  onPress={handleEditRoute}
                  style={styles.editRouteButton}
                >
                  <AppText variant="monoSmall" color={theme.colors.orange}>
                    Edit route
                  </AppText>
                </Pressable>
              </View>
              {routeRows.map((row, index) => (
                <View key={row.id}>
                  <RouteRow
                    kind={row.kind}
                    label={row.label}
                    value={row.value}
                  />
                  {index < routeRows.length - 1 ? (
                    <View style={styles.routeDivider} />
                  ) : null}
                </View>
              ))}
            </View>

            {scheduledAt ? null : (
              <FareOfferRow
                amountNgn={effectiveOfferNgn}
                estimateNgn={selectedRideOption.fareNgn}
                minNgn={minOfferNgn}
                isResolving={isFareResolving}
                onAdjust={adjustOffer}
              />
            )}

            <AppButton
              title={
                scheduledAt
                  ? isSubmitting
                    ? `Scheduling ${selectedRideOption.label}...`
                    : `Schedule ${selectedRideOption.label}`
                  : `Book ${selectedRideOption.label}`
              }
              onPress={handleBookRide}
              disabled={!canBookRide}
            />
          </ScrollView>
        ) : (
          <View style={styles.collapsedSheetContent}>
            <RideOptionList
              rideOptions={rideOptions}
              selectedRideTier={selectedRideTier}
              setSelectedRideTier={setSelectedRideTier}
              displayDistanceLabel={displayDistanceLabel}
              isFareResolving={isFareResolving}
            />

            {scheduledAt ? null : (
              <FareOfferRow
                amountNgn={effectiveOfferNgn}
                estimateNgn={selectedRideOption.fareNgn}
                minNgn={minOfferNgn}
                isResolving={isFareResolving}
                onAdjust={adjustOffer}
              />
            )}

            <AppButton
              title={
                scheduledAt
                  ? isSubmitting
                    ? `Scheduling ${selectedRideOption.label}...`
                    : `Schedule ${selectedRideOption.label}`
                  : `Book ${selectedRideOption.label}`
              }
              onPress={handleBookRide}
              disabled={!canBookRide}
            />
          </View>
        )}
      </Animated.View>
    </AppScreen>
  );
}

/**
 * The rider's price, and the two taps that change it.
 *
 * Naming your own fare is the whole premise of the marketplace, so it sits on
 * the booking screen at full size rather than hiding behind the estimate.
 */
function FareOfferRow({
  amountNgn,
  estimateNgn,
  minNgn,
  isResolving,
  onAdjust,
}: {
  amountNgn: number;
  estimateNgn: number;
  minNgn: number;
  isResolving: boolean;
  onAdjust: (delta: number) => void;
}) {
  const delta = amountNgn - estimateNgn;
  const atFloor = amountNgn <= minNgn;

  return (
    <View style={styles.offerRow}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Lower your offer"
        disabled={atFloor}
        onPress={() => onAdjust(-200)}
        style={[styles.offerStep, atFloor ? styles.offerStepDisabled : null]}
      >
        <MaterialIcons name="remove" size={20} color={theme.colors.black} />
      </Pressable>

      <View style={styles.offerCentre}>
        <AppText variant="monoSmall" color={theme.colors.orange}>
          YOUR OFFER
        </AppText>
        <AppText variant="metric">
          {isResolving ? "…" : formatNgn(amountNgn)}
        </AppText>
        <AppText variant="bodySmall" color={theme.colors.muted}>
          {delta === 0
            ? `Estimate ${formatNgn(estimateNgn)}`
            : delta > 0
              ? `${formatNgn(delta)} above the estimate`
              : `${formatNgn(Math.abs(delta))} below the estimate`}
        </AppText>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Raise your offer"
        onPress={() => onAdjust(200)}
        style={[styles.offerStep, styles.offerStepUp]}
      >
        <MaterialIcons name="add" size={20} color={theme.colors.black} />
      </Pressable>
    </View>
  );
}

function RideOptionList({
  rideOptions,
  selectedRideTier,
  setSelectedRideTier,
  displayDistanceLabel,
  isFareResolving,
}: {
  rideOptions: Array<{
    id: RideTier;
    label: string;
    subtitle: string;
    accentColor: string;
    badgeColor: string;
    etaMinutes: number;
    fareNgn: number;
  }>;
  selectedRideTier: RideTier;
  setSelectedRideTier: (tier: RideTier) => void;
  displayDistanceLabel: string;
  isFareResolving: boolean;
}) {
  return (
    <View style={styles.rideOptionsList}>
      {rideOptions.map((option) => {
        const selected = option.id === selectedRideTier;
        return (
          <Pressable
            key={option.id}
            onPress={() => setSelectedRideTier(option.id)}
            style={[
              styles.rideOptionCard,
              selected ? styles.rideOptionCardSelected : null,
            ]}
          >
            <View style={styles.rideOptionLeft}>
              <View
                style={[
                  styles.rideOptionIconShell,
                  selected ? styles.rideOptionIconShellSelected : null,
                ]}
              >
                <CarArtwork
                  accentColor={option.accentColor}
                  highlightColor={option.badgeColor}
                />
              </View>
              <View style={styles.rideOptionCopy}>
                <View style={styles.rideOptionTitleRow}>
                  <AppText variant="h3">{option.label}</AppText>
                  {selected ? (
                    <View style={styles.selectedBadge}>
                      <AppText
                        variant="monoSmall"
                        color={theme.colors.offWhite}
                      >
                        Selected
                      </AppText>
                    </View>
                  ) : null}
                </View>
                <AppText variant="bodySmall" color={theme.colors.muted}>
                  {option.subtitle}
                </AppText>
                <View style={styles.metricRow}>
                  <MetricPill label={`${option.etaMinutes} min`} />
                  <MetricPill label={displayDistanceLabel} muted />
                </View>
              </View>
            </View>
            <View style={styles.rideOptionPrice}>
              {isFareResolving ? (
                <AppText variant="bodySmall" color={theme.colors.muted}>
                  Estimating
                </AppText>
              ) : (
                <>
                  <AppText variant="monoSmall" color={theme.colors.muted}>
                    NGN
                  </AppText>
                  <AppText variant="h3">
                    {formatCompactNgn(option.fareNgn)}
                  </AppText>
                </>
              )}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function MetricPill({ label, muted }: { label: string; muted?: boolean }) {
  return (
    <View
      style={[
        styles.metricPill,
        muted ? styles.metricPillMuted : styles.metricPillAccent,
      ]}
    >
      <AppText variant="monoSmall" color={theme.colors.black}>
        {label}
      </AppText>
    </View>
  );
}

function RouteRow({
  kind,
  label,
  value,
}: {
  kind: "pickup" | "stop" | "destination";
  label: string;
  value: string;
}) {
  const dotStyle =
    kind === "pickup"
      ? styles.routeDotPickup
      : kind === "stop"
        ? styles.routeDotStop
        : styles.routeDotDestination;

  return (
    <View style={styles.routeRow}>
      <View style={[styles.routeDot, dotStyle]} />
      <View style={styles.routeCopy}>
        <AppText variant="monoSmall" color={theme.colors.muted}>
          {label.toUpperCase()}
        </AppText>
        <AppText variant="bodySmall" numberOfLines={2}>
          {value || "Not set"}
        </AppText>
      </View>
    </View>
  );
}

function MapRouteSummary({
  pickup,
  destination,
  onEdit,
}: {
  pickup: string;
  destination: string;
  onEdit: () => void;
}) {
  return (
    <Pressable onPress={onEdit} style={styles.mapRouteCard}>
      <View style={styles.mapRoutePath}>
        <View style={[styles.mapRouteNode, styles.mapRouteNodePickup]} />
        <View style={styles.mapRouteLine} />
        <View style={[styles.mapRouteNode, styles.mapRouteNodeDestination]} />
      </View>

      <View style={styles.mapRouteCopy}>
        <View style={styles.mapRouteTextBlock}>
          <AppText variant="monoSmall" color={theme.colors.muted}>
            PICKUP
          </AppText>
          <AppText variant="bodySmall" style={styles.mapRouteAddress}>
            {pickup || "Pickup address"}
          </AppText>
        </View>

        <View style={styles.mapRouteDivider} />

        <View style={styles.mapRouteTextBlock}>
          <AppText variant="monoSmall" color={theme.colors.muted}>
            DESTINATION
          </AppText>
          <AppText variant="bodySmall" style={styles.mapRouteAddress}>
            {destination || "Destination address"}
          </AppText>
        </View>
      </View>

      <View style={styles.mapRouteEditButton}>
        <MaterialIcons name="edit" size={17} color={theme.colors.black} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  offerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.white,
    ...theme.shadows.card,
  },
  offerCentre: {
    flex: 1,
    alignItems: "center",
    gap: 1,
  },
  offerStep: {
    width: 52,
    height: 52,
    borderRadius: theme.radius.sm,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.offWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  offerStepUp: {
    backgroundColor: theme.colors.orangeLight,
  },
  offerStepDisabled: {
    opacity: 0.4,
  },
  container: {
    flex: 1,
    paddingHorizontal: 0,
    paddingBottom: 0,
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
    alignItems: "flex-start",
    gap: theme.spacing.sm,
  },
  mapTopInfoStack: {
    flex: 1,
    gap: theme.spacing.xs,
    alignItems: "flex-end",
  },
  mapChip: {
    alignSelf: "flex-end",
    backgroundColor: theme.colors.white,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    ...theme.shadows.card,
  },
  mapRouteCard: {
    width: "100%",
    flexDirection: "row",
    alignItems: "stretch",
    gap: theme.spacing.sm,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    borderRadius: theme.radius.md,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    ...theme.shadows.card,
  },
  mapRoutePath: {
    width: 18,
    alignItems: "center",
    paddingVertical: 5,
  },
  mapRouteNode: {
    width: 10,
    height: 10,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.black,
  },
  mapRouteNodePickup: {
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.green,
  },
  mapRouteNodeDestination: {
    borderRadius: 3,
    backgroundColor: theme.colors.orange,
  },
  mapRouteLine: {
    flex: 1,
    width: 2,
    minHeight: 34,
    marginVertical: 5,
    backgroundColor: theme.colors.black,
    opacity: 0.45,
  },
  mapRouteCopy: {
    flex: 1,
    gap: theme.spacing.xs,
    minWidth: 0,
  },
  mapRouteTextBlock: {
    gap: 1,
  },
  mapRouteAddress: {
    lineHeight: 17,
  },
  mapRouteDivider: {
    height: 1,
    backgroundColor: theme.colors.borderLight,
  },
  mapRouteEditButton: {
    width: 36,
    height: 36,
    alignSelf: "center",
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.orangeLight,
    alignItems: "center",
    justifyContent: "center",
  },
  priceBadge: {
    position: "absolute",
    right: theme.spacing.gutter,
    bottom: 264,
  },
  priceBadgeInner: {
    backgroundColor: theme.colors.white,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    ...theme.shadows.card,
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colors.offWhite,
    borderTopLeftRadius: theme.radius.md,
    borderTopRightRadius: theme.radius.md,
    borderWidth: theme.borders.thick,
    borderBottomWidth: 0,
    borderColor: theme.colors.black,
    paddingHorizontal: theme.spacing.sm,
    paddingTop: 4,
    paddingBottom: theme.spacing.sm,
  },
  sheetExpanded: {
    minHeight: 260,
    maxHeight: "76%",
  },
  sheetCollapsed: {
    minHeight: 0,
  },
  sheetScrollContent: {
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.lg,
  },
  collapsedSheetContent: {
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.xs,
  },
  handleArea: {
    alignItems: "center",
    paddingVertical: theme.spacing.xs,
  },
  handle: {
    width: 56,
    height: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.mutedLight,
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  sheetHeaderText: {
    flex: 1,
  },
  rideIcon: {
    width: 50,
    height: 42,
    borderRadius: theme.radius.pill,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.white,
    alignItems: "center",
    justifyContent: "center",
    ...theme.shadows.card,
  },
  rideOptionsList: {
    gap: theme.spacing.xs,
  },
  rideOptionCard: {
    backgroundColor: theme.colors.white,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    ...theme.shadows.card,
  },
  rideOptionCardSelected: {
    backgroundColor: "#FFF7F1",
    borderColor: theme.colors.orange,
  },
  rideOptionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  rideOptionIconShell: {
    width: 64,
    height: 46,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.offWhite,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.borderLight,
  },
  rideOptionIconShellSelected: {
    backgroundColor: "#FFF0E4",
    borderColor: theme.colors.orange,
  },
  rideOptionCopy: {
    flex: 1,
    gap: 2,
  },
  rideOptionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  selectedBadge: {
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.black,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  metricRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.xs,
  },
  metricPill: {
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.black,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  metricPillAccent: {
    backgroundColor: "#FFD1B5",
  },
  metricPillMuted: {
    backgroundColor: theme.colors.white,
  },
  rideOptionPrice: {
    minWidth: 68,
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 1,
  },
  routeBox: {
    backgroundColor: theme.colors.white,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.xs,
    ...theme.shadows.card,
  },
  routeBoxHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  editRouteButton: {
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 6,
  },
  routeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  routeDot: {
    width: 14,
    height: 14,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.black,
  },
  routeDotPickup: {
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.green,
  },
  routeDotStop: {
    borderRadius: 4,
    backgroundColor: "#FFD1B5",
  },
  routeDotDestination: {
    borderRadius: 4,
    backgroundColor: theme.colors.orange,
  },
  routeCopy: {
    flex: 1,
    gap: 1,
  },
  routeDivider: {
    height: 1,
    backgroundColor: theme.colors.borderLight,
    marginLeft: 22,
    marginVertical: theme.spacing.xs,
  },
  vehicleArtwork: {
    position: "relative",
    width: 46,
    height: 32,
  },
  rideTierBadge: {
    position: "absolute",
    right: -4,
    bottom: -4,
    width: 20,
    height: 20,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.black,
    borderRadius: theme.radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  evWrap: {
    position: "relative",
    width: 46,
    height: 30,
    marginTop: 2,
  },
  evBody: {
    position: "absolute",
    left: 4,
    right: 3,
    bottom: 6,
    height: 16,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    borderRadius: 10,
  },
  evCabin: {
    position: "absolute",
    left: 9,
    top: -8,
    width: 18,
    height: 10,
    borderWidth: theme.borders.thick,
    borderBottomWidth: 0,
    borderColor: theme.colors.black,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 8,
    backgroundColor: theme.colors.white,
  },
  evWindow: {
    position: "absolute",
    left: 12,
    top: -5,
    width: 12,
    height: 5,
    borderRadius: 4,
    backgroundColor: "#D9F3FF",
    borderWidth: 1.5,
    borderColor: theme.colors.black,
  },
  evBolt: {
    position: "absolute",
    top: 4,
    left: 20,
    width: 4,
    height: 7,
    transform: [{ skewX: "-18deg" }],
    borderRadius: 1,
  },
  evLight: {
    position: "absolute",
    top: 5,
    width: 3,
    height: 5,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: theme.colors.black,
  },
  evHeadlight: {
    right: 2,
    backgroundColor: "#FFF4CC",
  },
  evTaillight: {
    left: 2,
    backgroundColor: "#FFC4C4",
  },
  evWheel: {
    position: "absolute",
    bottom: 0,
    width: 10,
    height: 10,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.black,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.black,
    alignItems: "center",
    justifyContent: "center",
  },
  evWheelLeft: {
    left: 9,
  },
  evWheelRight: {
    right: 6,
  },
  evWheelHub: {
    width: 3,
    height: 3,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.white,
  },
});
