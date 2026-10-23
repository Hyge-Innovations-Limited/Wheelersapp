import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path } from "react-native-svg";

import { LiveMap } from "@/components/live-map";
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
import { OfferCard } from "@/components/rider/offer-card";
import {
  PriceCard,
  PriceCardChip,
  PriceCardNote,
} from "@/components/rider/price-card";
import { PulseCircle } from "@/components/static-map";
import { clock, secondsUntil } from "@/lib/countdown";
import { parseRideEstimateParam } from "@/lib/ride-estimate";
import { parseRideItineraryParam, serializeRideItinerary } from "@/lib/ride-route";
import { useRideSession } from "@/lib/ride-session";
import { useWalletOverview } from "@/lib/wallet-overview";
import { useGoHome } from "@/hooks/use-go-home";

const { colors, fonts } = rider;

/** Higher prices offered after a search nobody took: 5%, 10% and 15% more, to the nearest ₦50. */
const RETRY_RAISES = [1.05, 1.1, 1.15];

/** The server's words when a wallet cannot cover the price being accepted. */
const SHORT_OF_MONEY = /insufficient|not enough|balance|top up|fund your wallet|add money/i;

/** "Yaba" from "Yaba, Lagos, Nigeria". */
function shortPlace(label: string | undefined): string {
  return (label ?? "").split(",")[0]?.trim() ?? "";
}

/**
 * Steps 2 and 3 of getting a ride, in one route.
 *
 * The rider's price goes to drivers nearby; they reply with theirs; the rider
 * picks one. What is on screen follows the ride: finding drivers, the offers
 * that have come in, changing the price, or a search nobody took.
 */
export default function MatchingScreen() {
  const router = useRouter();
  const goHome = useGoHome();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const params = useLocalSearchParams<{
    itinerary?: string | string[];
    estimate?: string | string[];
    offer?: string | string[];
  }>();

  const itinerary = useMemo(
    () => parseRideItineraryParam(params.itinerary),
    [params.itinerary],
  );
  const initialEstimate = useMemo(
    () => parseRideEstimateParam(params.estimate),
    [params.estimate],
  );
  const serializedItinerary = useMemo(
    () => serializeRideItinerary(itinerary),
    [itinerary],
  );

  const routeSnapshot = useMemo(() => {
    if (initialEstimate?.pickup && initialEstimate.destination && initialEstimate.route) {
      return {
        pickup: initialEstimate.pickup,
        destination: initialEstimate.destination,
        stops: initialEstimate.stops ?? [],
        route: initialEstimate.route,
      };
    }
    return null;
  }, [initialEstimate]);

  const requestedOfferNgn = useMemo(() => {
    const raw = Array.isArray(params.offer) ? params.offer[0] : params.offer;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0
      ? Math.round(parsed)
      : initialEstimate?.fareEstimateNgn;
  }, [params.offer, initialEstimate?.fareEstimateNgn]);

  const {
    currentRide,
    error,
    requestRide,
    acceptOffer,
    updateOffer,
    dismissOffer,
    clearRide,
  } = useRideSession();
  const { overview: wallet } = useWalletOverview();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  /** The price being set in the change-price view; null while that view is closed. */
  const [draftNgn, setDraftNgn] = useState<number | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  /** The higher price picked after a search nobody took. */
  const [pickedRetryNgn, setPickedRetryNgn] = useState<number | null>(null);
  /** The price last sent to drivers from this screen. */
  const [askedNgn, setAskedNgn] = useState<number | undefined>(requestedOfferNgn);
  /** A new search waiting for the finished one to be put away. */
  const [pendingSearch, setPendingSearch] = useState<{ offerNgn?: number } | null>(null);
  const [requestSettled, setRequestSettled] = useState(false);
  const requestFiredRef = useRef(false);
  /** A ride that had already ended when this screen opened. */
  const staleRideIdRef = useRef<string | null>(null);
  const navigatedRef = useRef(false);
  const rideAtMountRef = useRef(currentRide);

  const offers = useMemo(() => currentRide?.offers ?? [], [currentRide?.offers]);
  const status = currentRide?.status;
  const riderOfferNgn = currentRide?.riderOfferNgn ?? askedNgn;
  const suggestedNgn = currentRide?.suggestedFareNgn;
  const minOfferNgn = currentRide?.minOfferNgn ?? 100;
  const timedOut = currentRide?.bidTimeout === true;
  const isSearching = status === "requesting" || status === "bidding" || status === "matching";
  const confirming = status === "matching" && Boolean(currentRide?.driver);
  const requestFailed = requestSettled && !currentRide && pendingSearch === null;
  const destination = itinerary.stops[itinerary.stops.length - 1];
  const routeLabel = [shortPlace(itinerary.pickup), shortPlace(destination)]
    .filter(Boolean)
    .join(" to ");

  const sendRequest = useCallback(
    async (offerNgn: number | undefined, onFailure?: () => void) => {
      setRequestSettled(false);
      try {
        await requestRide(itinerary, { offerNgn });
      } catch (requestError) {
        Alert.alert(
          "Could not request this ride",
          requestError instanceof Error
            ? requestError.message
            : "Something went wrong. Please try again.",
          onFailure ? [{ text: "Back", onPress: onFailure }] : undefined,
        );
      } finally {
        setRequestSettled(true);
      }
    },
    [itinerary, requestRide],
  );

  /* ── publish the ride, exactly once ────────────────────────────────── */

  useEffect(() => {
    if (requestFiredRef.current) return;
    requestFiredRef.current = true;

    // Coming back from "Set your price" with a search still open: the request
    // is not sent twice, so the price just chosen goes out as a price change.
    const open = rideAtMountRef.current;
    if (
      open &&
      open.status === "bidding" &&
      open.bidTimeout !== true &&
      requestedOfferNgn !== undefined &&
      open.riderOfferNgn !== undefined &&
      open.riderOfferNgn !== requestedOfferNgn &&
      serializeRideItinerary(open.itinerary) === serializedItinerary
    ) {
      void updateOffer(requestedOfferNgn).catch(() => undefined);
    }

    // A ride that already ended (cancelled, or finished and never rated) is
    // still in memory: put it away, then search. Left there, its "cancelled"
    // status sent this screen home while the new request went out.
    if (open && (open.status === "cancelled" || open.status === "completed")) {
      staleRideIdRef.current = open.rideId;
      setAskedNgn(requestedOfferNgn);
      setPendingSearch({ offerNgn: requestedOfferNgn });
      clearRide();
      return;
    }

    void sendRequest(requestedOfferNgn, () => router.back());
    // Once per mount on purpose: re-running this on every render would publish
    // the same trip to drivers over and over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── search again after a search nobody took ───────────────────────── */

  const searchAgain = useCallback(
    (offerNgn: number | undefined) => {
      void Haptics.selectionAsync();
      setDraftNgn(null);
      setPickedRetryNgn(null);
      setAskedNgn(offerNgn);
      setPendingSearch({ offerNgn });
      // The finished search has to be put away first: a new request for the
      // same trip is ignored while the old one is still held.
      clearRide();
    },
    [clearRide],
  );

  useEffect(() => {
    if (!pendingSearch || currentRide) return;
    const { offerNgn } = pendingSearch;
    setPendingSearch(null);
    void sendRequest(offerNgn);
  }, [pendingSearch, currentRide, sendRequest]);

  /* ── follow the ride off this screen ───────────────────────────────── */

  useEffect(() => {
    if (navigatedRef.current || !status) return;

    if (status === "matched" || status === "active") {
      navigatedRef.current = true;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace({
        pathname: "/driver-found",
        params: { itinerary: serializedItinerary },
      });
      return;
    }

    // Only a ride cancelled while this screen was searching for it sends the
    // rider home, not the leftover of an earlier one. Not while "Cancel this
    // ride?" is open over it: that screen takes the rider home itself.
    if (status === "cancelled" && currentRide?.rideId !== staleRideIdRef.current && navigation.isFocused()) {
      navigatedRef.current = true;
      goHome();
    }
  }, [status, router, serializedItinerary, currentRide?.rideId, navigation, goHome]);

  /* ── how long the search stays open ────────────────────────────────── */

  const closesAtMs = useMemo(() => {
    const parsed = currentRide?.bidsCloseAt ? Date.parse(currentRide.bidsCloseAt) : NaN;
    return Number.isFinite(parsed) ? parsed : null;
  }, [currentRide?.bidsCloseAt]);

  useEffect(() => {
    if (!isSearching || timedOut || closesAtMs === null) return;
    setNowMs(Date.now());
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isSearching, timedOut, closesAtMs]);

  const timeLeftLine =
    closesAtMs !== null && isSearching && !timedOut
      ? `Search stays open for ${clock(secondsUntil(closesAtMs, nowMs))}`
      : null;

  /* ── a new offer deserves to be felt, not just seen ────────────────── */

  const offerCountRef = useRef(0);
  useEffect(() => {
    if (offers.length > offerCountRef.current) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    offerCountRef.current = offers.length;
  }, [offers.length]);

  /* ── actions ───────────────────────────────────────────────────────── */

  const handleAccept = useCallback(
    async (driverId: string) => {
      setIsSubmitting(true);
      try {
        await acceptOffer(driverId);
      } catch (acceptError) {
        Alert.alert(
          "Could not accept that offer",
          acceptError instanceof Error
            ? acceptError.message
            : "That driver may have moved on. Try another offer.",
        );
      } finally {
        setIsSubmitting(false);
      }
    },
    [acceptOffer],
  );

  const handleDeclineAll = useCallback(() => {
    offers.forEach((offer) => dismissOffer(offer.driverId));
  }, [offers, dismissOffer]);

  /** A new price goes to every driver nearby and the search window starts again. */
  const handleUpdatePrice = useCallback(async () => {
    if (draftNgn === null) return;
    if (timedOut || !currentRide) {
      searchAgain(draftNgn);
      return;
    }
    if (draftNgn === riderOfferNgn) {
      setDraftNgn(null);
      return;
    }
    setIsUpdating(true);
    try {
      await updateOffer(draftNgn);
      setAskedNgn(draftNgn);
      setDraftNgn(null);
    } catch (updateError) {
      Alert.alert(
        "Could not update your price",
        updateError instanceof Error ? updateError.message : "Please try again.",
      );
    } finally {
      setIsUpdating(false);
    }
  }, [draftNgn, timedOut, currentRide, riderOfferNgn, updateOffer, searchAgain]);

  // Cancelling asks why first, on the same screen as a cancel once a driver
  // is coming: it cancels the request on the server and takes the rider home.
  // "Keep ride" brings them back here, still searching.
  const handleCancel = useCallback(() => {
    router.push("/rider-cancel");
  }, [router]);

  /** Leaving a search that has already ended: nothing to cancel, only to put away. */
  const handleCloseFinished = useCallback(() => {
    navigatedRef.current = true;
    clearRide();
    goHome();
  }, [clearRide, goHome]);

  const openChangePrice = useCallback(
    (raiseBy = 0) => {
      const base = riderOfferNgn ?? suggestedNgn ?? minOfferNgn;
      setDraftNgn(Math.max(minOfferNgn, base + raiseBy));
    },
    [riderOfferNgn, suggestedNgn, minOfferNgn],
  );

  // Android's back button closes the change-price view before it leaves the screen.
  useEffect(() => {
    if (draftNgn === null) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      setDraftNgn(null);
      return true;
    });
    return () => subscription.remove();
  }, [draftNgn]);

  /* ── the error line ────────────────────────────────────────────────── */

  const balanceNgn = typeof wallet?.balanceNgn === "number" ? wallet.balanceNgn : null;
  const cheapest = offers[0];
  const needsMoney =
    error !== null &&
    (SHORT_OF_MONEY.test(error) ||
      (balanceNgn !== null && cheapest !== undefined && balanceNgn < cheapest.counterOfferNgn));

  const errorBanner = error ? (
    <View accessibilityLiveRegion="polite" accessibilityRole="alert" style={styles.errorBanner}>
      <Ionicons color={colors.danger} name="alert-circle" size={20} />
      <RText variant="small" color={colors.danger} style={styles.errorText}>
        {error}
      </RText>
      {needsMoney ? (
        <RLink
          color={colors.danger}
          onPress={() => router.push("/rider/wallet")}
          title="Add money"
        />
      ) : null}
    </View>
  ) : null;

  const suggestedLine =
    typeof suggestedNgn === "number" && suggestedNgn > 0
      ? `Suggested price ${naira(suggestedNgn)}`
      : null;

  /* ── change your price ─────────────────────────────────────────────── */

  if (draftNgn !== null) {
    const prices = offers.map((offer) => offer.counterOfferNgn);
    const lowest = prices.length > 0 ? Math.min(...prices) : null;
    const highest = prices.length > 0 ? Math.max(...prices) : null;
    const within = prices.filter((price) => price <= draftNgn).length;
    const restarting = timedOut || !currentRide;

    return (
      <RScreen contentStyle={styles.page}>
        <StatusBar style="dark" backgroundColor={colors.cream} />
        <View style={styles.header}>
          <RBack onPress={() => setDraftNgn(null)} />
          <RText variant="title" style={styles.headerTitle}>
            Change your price
          </RText>
        </View>

        <ScrollView
          contentContainerStyle={styles.pageBody}
          showsVerticalScrollIndicator={false}
          style={styles.flex}>
          <RStepBar active={offers.length > 0 ? 3 : 2} />
          <RText color={colors.muted}>
            Drivers nearby will see your new offer and can reply again.
          </RText>

          <PriceCard
            amountNgn={draftNgn}
            label="New offer"
            minNgn={minOfferNgn}
            onChange={setDraftNgn}
            sideLabel="Current"
            sideValue={riderOfferNgn !== undefined ? naira(riderOfferNgn) : null}>
            <View style={styles.chipRow}>
              <PriceCardChip
                accessibilityLabel="Add 200 naira"
                onPress={() => setDraftNgn(draftNgn + 200)}
                title="+ ₦200"
              />
              <PriceCardChip
                accessibilityLabel="Add 500 naira"
                onPress={() => setDraftNgn(draftNgn + 500)}
                title="+ ₦500"
              />
              <PriceCardChip
                accessibilityLabel="Reset to your current offer"
                onPress={() => setDraftNgn(Math.max(minOfferNgn, riderOfferNgn ?? minOfferNgn))}
                title="Reset"
              />
            </View>
            {suggestedLine ? <PriceCardNote strong>{suggestedLine}</PriceCardNote> : null}
            {currentRide?.minOfferNgn !== undefined ? (
              <PriceCardNote>
                {draftNgn <= minOfferNgn
                  ? "This is the minimum offer for this trip."
                  : `Minimum offer: ${naira(minOfferNgn)}`}
              </PriceCardNote>
            ) : null}
          </PriceCard>

          {lowest !== null && highest !== null ? (
            <RCard style={styles.askedCard}>
              <RText variant="label">WHAT DRIVERS ASKED FOR</RText>
              <View style={styles.askedRow}>
                <RText variant="small" color={colors.muted}>
                  Lowest offer
                </RText>
                <RText variant="smallBold" style={styles.tabular}>
                  {naira(lowest)}
                </RText>
              </View>
              <View style={styles.askedRow}>
                <RText variant="small" color={colors.muted}>
                  Highest offer
                </RText>
                <RText variant="smallBold" style={styles.tabular}>
                  {naira(highest)}
                </RText>
              </View>
              <RText
                accessibilityLiveRegion="polite"
                variant="caption"
                color={colors.orangeText}>
                {within === 0
                  ? "This is below every driver offer so far."
                  : `${within} of ${prices.length} driver ${prices.length === 1 ? "offer" : "offers"} so far ${within === 1 ? "is" : "are"} at or below this price.`}
              </RText>
            </RCard>
          ) : null}

          {errorBanner}
        </ScrollView>

        <View style={styles.footer}>
          <RButton
            loading={isUpdating}
            onPress={() => void handleUpdatePrice()}
            title={`${restarting ? "Search again at" : "Update price to"} ${naira(draftNgn)}`}
          />
          <RLink
            onPress={() => setDraftNgn(null)}
            title={riderOfferNgn !== undefined ? `Keep ${naira(riderOfferNgn)}` : "Back"}
          />
        </View>
      </RScreen>
    );
  }

  /* ── nobody took it ────────────────────────────────────────────────── */

  if (timedOut) {
    const retryPrices =
      riderOfferNgn !== undefined
        ? Array.from(
            new Set(RETRY_RAISES.map((raise) => Math.round((riderOfferNgn * raise) / 50) * 50)),
          ).filter((price) => price > riderOfferNgn)
        : [];
    const picked =
      pickedRetryNgn !== null && retryPrices.includes(pickedRetryNgn)
        ? pickedRetryNgn
        : retryPrices[0];
    const distanceKm = currentRide?.plannedDistanceKm ?? initialEstimate?.plannedDistanceKm;
    const durationSeconds =
      currentRide?.plannedDurationSeconds ?? initialEstimate?.plannedDurationSeconds;
    const tripLine = [
      typeof distanceKm === "number" ? `${distanceKm.toFixed(1)} km` : null,
      typeof durationSeconds === "number"
        ? `about ${Math.max(1, Math.ceil(durationSeconds / 60))} min`
        : null,
    ]
      .filter(Boolean)
      .join(" · ");

    return (
      <RScreen contentStyle={styles.page}>
        <StatusBar style="dark" backgroundColor={colors.cream} />
        <View style={styles.header}>
          <RBack icon="close" label="Close" onPress={handleCloseFinished} />
        </View>

        <ScrollView
          contentContainerStyle={styles.pageBody}
          showsVerticalScrollIndicator={false}
          style={styles.flex}>
          <RStepBar active={2} />

          <Svg accessibilityElementsHidden height={96} viewBox="0 0 350 110" width="100%">
            <Path d="M0 96h350" stroke={colors.line} strokeDasharray="16 12" strokeWidth={3} />
            <Circle cx={60} cy={74} fill={colors.ink} r={16} />
            <Path d="M60 58v-22" stroke={colors.ink} strokeLinecap="round" strokeWidth={4} />
            <Circle cx={60} cy={30} fill={colors.orange} r={7} />
            <Path
              d="M212 88h92c4 0 7-3 7-7v-5c0-4-3-6-7-7l-14-3-10-11c-2-2-5-3-7-3h-29c-3 0-6 2-8 4l-7 10-12 3c-4 1-6 4-6 7v5c0 4 3 7 7 7z"
              fill="none"
              stroke="#B8AE9E"
              strokeDasharray="7 6"
              strokeWidth={3}
            />
          </Svg>

          <View style={styles.titleBlock}>
            <RText variant="display" style={styles.noDriverTitle}>
              {riderOfferNgn !== undefined
                ? `No driver accepted ${naira(riderOfferNgn)}`
                : "No driver accepted your offer"}
            </RText>
            <RText color={colors.muted}>
              You have not been charged. Your trip details are saved.
            </RText>
          </View>

          {routeLabel ? (
            <RCard style={styles.tripCard}>
              <RText variant="bodyBold" numberOfLines={2}>
                {routeLabel}
              </RText>
              {tripLine ? (
                <RText variant="small" color={colors.muted}>
                  {tripLine}
                </RText>
              ) : null}
            </RCard>
          ) : null}

          {retryPrices.length > 0 ? (
            <RCard tone="ink" style={styles.retryCard}>
              <RText variant="small" color={colors.onInkMuted} style={styles.retryLabel}>
                Try a higher price
              </RText>
              <View style={styles.retryRow}>
                {retryPrices.map((price) => {
                  const on = price === picked;
                  return (
                    <Pressable
                      accessibilityLabel={naira(price)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      key={price}
                      onPress={() => {
                        void Haptics.selectionAsync();
                        setPickedRetryNgn(price);
                      }}
                      style={({ pressed }) => [
                        styles.retryOption,
                        on ? styles.retryOptionOn : null,
                        pressed ? styles.pressed : null,
                      ]}>
                      <RText
                        adjustsFontSizeToFit
                        color={on ? colors.ink : colors.cream}
                        numberOfLines={1}
                        style={styles.retryOptionText}>
                        {naira(price)}
                      </RText>
                    </Pressable>
                  );
                })}
              </View>
              <RLink
                color={colors.orange}
                onPress={() => openChangePrice()}
                style={styles.retryOther}
                title="Enter another amount"
              />
            </RCard>
          ) : null}

          {errorBanner}
        </ScrollView>

        <View style={styles.footer}>
          {picked !== undefined ? (
            <RButton
              onPress={() => searchAgain(picked)}
              title={`Search again at ${naira(picked)}`}
            />
          ) : null}
          <RButton
            onPress={() => searchAgain(riderOfferNgn)}
            size={picked !== undefined ? "md" : "lg"}
            title={
              riderOfferNgn !== undefined
                ? `Search again at ${naira(riderOfferNgn)}`
                : "Search again"
            }
            variant={picked !== undefined ? "ghost" : "primary"}
          />
        </View>
      </RScreen>
    );
  }

  /* ── the driver has been chosen; the server is confirming ──────────── */

  if (confirming) {
    return (
      <RScreen contentStyle={styles.page}>
        <StatusBar style="dark" backgroundColor={colors.cream} />
        <RStepBar active={3} />
        <View style={styles.confirming}>
          <ActivityIndicator color={colors.orange} size="large" />
          <RText variant="title" style={styles.center}>
            Confirming your driver
          </RText>
          {currentRide?.driver?.driverName ? (
            <RText color={colors.muted} style={styles.center}>
              {currentRide.driver.driverName}
              {typeof currentRide.driver.lockedFareNgn === "number"
                ? ` · ${naira(currentRide.driver.lockedFareNgn)}`
                : ""}
            </RText>
          ) : null}
        </View>
        {errorBanner}
        <RLink color={colors.danger} onPress={() => void handleCancel()} title="Cancel search" />
      </RScreen>
    );
  }

  /* ── drivers have replied ──────────────────────────────────────────── */

  if (offers.length > 0) {
    return (
      <RScreen contentStyle={styles.page}>
        <StatusBar style="dark" backgroundColor={colors.cream} />
        <RStepBar active={3} />
        <View style={styles.offersHead}>
          <RText accessibilityLiveRegion="polite" variant="title">
            {offers.length} {offers.length === 1 ? "driver offer" : "driver offers"}
          </RText>
          <RText variant="small" color={colors.muted} style={styles.tabular}>
            {routeLabel}
            {routeLabel && riderOfferNgn !== undefined ? " · " : ""}
            {riderOfferNgn !== undefined ? (
              <>
                your offer <RText variant="smallBold">{naira(riderOfferNgn)}</RText>
              </>
            ) : null}
          </RText>
          {suggestedLine || timeLeftLine ? (
            <RText variant="caption" style={styles.tabular}>
              {[suggestedLine, timeLeftLine].filter(Boolean).join(" · ")}
            </RText>
          ) : null}
        </View>

        {errorBanner}

        <ScrollView
          contentContainerStyle={styles.offerList}
          showsVerticalScrollIndicator={false}
          style={styles.flex}>
          {offers.map((offer, index) => (
            <OfferCard
              busy={isSubmitting}
              featured={index === 0}
              key={offer.driverId}
              offer={offer}
              onAccept={() => void handleAccept(offer.driverId)}
              onDecline={() => dismissOffer(offer.driverId)}
              riderOfferNgn={riderOfferNgn}
            />
          ))}
        </ScrollView>

        <View style={styles.footer}>
          <View style={styles.footerRow}>
            <RButton
              onPress={() => openChangePrice()}
              size="md"
              style={styles.flex}
              title="Change my price"
              variant="ghost"
            />
            <RButton
              onPress={handleDeclineAll}
              size="md"
              style={styles.flex}
              title="Decline all"
              variant="ghost"
            />
          </View>
          <RLink color={colors.danger} onPress={() => void handleCancel()} title="Cancel search" />
        </View>
      </RScreen>
    );
  }

  /* ── finding drivers ───────────────────────────────────────────────── */

  const mapHeight = Math.round(Math.min(330, windowHeight * 0.39));
  const canReprice = status === "bidding";

  return (
    <RScreen
      avoidKeyboard={false}
      contentStyle={styles.mapPage}
      safeAreaEdges={["left", "right", "bottom"]}>
      <StatusBar style="dark" />

      <View style={{ height: mapHeight }}>
        <LiveMap
          fitPadding={{ top: 80, right: 40, bottom: 80, left: 40 }}
          height={mapHeight}
          initialCenter={routeSnapshot?.pickup}
          destination={routeSnapshot?.destination}
          pickup={routeSnapshot?.pickup}
          route={routeSnapshot?.route}
          stops={routeSnapshot?.stops}>
          {requestFailed ? null : <SearchPulse />}
          <View style={[styles.mapBack, { top: insets.top + 12 }]}>
            <RBack />
          </View>
        </LiveMap>
      </View>

      <ScrollView
        contentContainerStyle={styles.sheetBody}
        showsVerticalScrollIndicator={false}
        style={styles.sheet}>
        {/* Drivers are being found: the step keeps moving while it is. */}
        <RStepBar active={2} working={!requestFailed} />

        <View style={styles.titleBlock}>
          <RText variant="title">Finding drivers</RText>
          <RText accessibilityLiveRegion="polite" variant="small" color={colors.muted}>
            {requestFailed
              ? "We could not send your request. Check your connection and try again."
              : status === "bidding"
                ? "Your offer has been sent to drivers near you."
                : "Sending your offer to drivers near you."}
          </RText>
        </View>

        <RCard tone="ink" style={styles.offerCard}>
          <View style={styles.offerTop}>
            <View style={styles.offerWho}>
              <RText variant="small" color={colors.onInkMuted}>
                Your offer
              </RText>
              {routeLabel ? (
                <RText variant="small" color={colors.onInkSoft} numberOfLines={2}>
                  {routeLabel}
                </RText>
              ) : null}
            </View>
            {riderOfferNgn !== undefined ? (
              <RText variant="figure" color={colors.orange} style={styles.offerFigure}>
                {naira(riderOfferNgn)}
              </RText>
            ) : null}
          </View>
          {suggestedLine || timeLeftLine ? (
            <View style={styles.offerMeta}>
              {suggestedLine ? (
                <RText variant="caption" color={colors.onInkMuted} style={styles.tabular}>
                  {suggestedLine}
                </RText>
              ) : null}
              {timeLeftLine ? (
                <RText variant="caption" color={colors.onInkMuted} style={styles.tabular}>
                  {timeLeftLine}
                </RText>
              ) : null}
            </View>
          ) : null}
        </RCard>

        {errorBanner}

        {canReprice ? (
          <View style={styles.raise}>
            <RText variant="label">WANT A FASTER ANSWER? RAISE YOUR OFFER</RText>
            <View style={styles.footerRow}>
              <RButton
                accessibilityLabel="Raise your offer by 200 naira"
                onPress={() => openChangePrice(200)}
                size="md"
                style={styles.flex}
                title="+ ₦200"
                variant="ghost"
              />
              <RButton
                accessibilityLabel="Raise your offer by 500 naira"
                onPress={() => openChangePrice(500)}
                size="md"
                style={styles.flex}
                title="+ ₦500"
                variant="ghost"
              />
              <RButton
                accessibilityLabel="Set another price"
                onPress={() => openChangePrice()}
                size="md"
                style={styles.flex}
                title="Other"
                variant="ghost"
              />
            </View>
          </View>
        ) : null}

        <View style={styles.spacer} />

        {requestFailed ? (
          <RButton onPress={() => setPendingSearch({ offerNgn: askedNgn })} title="Try again" />
        ) : (
          <View style={styles.waiting}>
            <RText variant="bodyBold" color={colors.muted}>
              Waiting for the first offer
            </RText>
          </View>
        )}
        <RLink color={colors.danger} onPress={() => void handleCancel()} title="Cancel search" />
      </ScrollView>
    </RScreen>
  );
}

/** The rings that spread from the middle of the map while drivers are being found. */
function SearchPulse() {
  return (
    <View pointerEvents="none" style={styles.pulseWrap}>
      <PulseCircle color={colors.orange} size={140} style={styles.pulseOuter} />
      <PulseCircle color={colors.orange} delay={260} size={92} style={styles.pulseInner} />
      <View style={styles.pulseDot}>
        <Ionicons color={colors.orange} name="location" size={24} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: "center" },
  tabular: { fontVariant: ["tabular-nums"] },
  pressed: { opacity: 0.72 },
  spacer: { flexGrow: 1 },

  page: { flex: 1, paddingHorizontal: rider.gutter, paddingTop: 12, paddingBottom: 12, gap: 12 },
  pageBody: { gap: 14, paddingBottom: 16 },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  headerTitle: { flex: 1, fontSize: 26, lineHeight: 30 },
  footer: { gap: 6 },
  footerRow: { flexDirection: "row", gap: 10 },
  titleBlock: { gap: 4 },

  chipRow: { flexDirection: "row", gap: 8 },
  askedCard: { gap: 8, paddingVertical: 14, borderRadius: rider.radius.lg },
  askedRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },

  noDriverTitle: { fontSize: 34, lineHeight: 37 },
  tripCard: { gap: 4, paddingVertical: 14, borderRadius: rider.radius.lg },
  retryCard: { gap: 12, padding: 18 },
  retryLabel: { fontSize: 15 },
  retryRow: { flexDirection: "row", gap: 10 },
  retryOption: {
    flex: 1,
    height: 64,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.inkLine,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  retryOptionOn: { borderColor: colors.orange, backgroundColor: colors.orange },
  retryOptionText: { fontFamily: fonts.display, fontSize: 20, fontVariant: ["tabular-nums"] },
  retryOther: { alignSelf: "flex-start", paddingHorizontal: 0 },

  confirming: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14 },

  offersHead: { gap: 2 },
  offerList: { gap: 12, paddingBottom: 12 },

  mapPage: { flex: 1, paddingHorizontal: 0, paddingBottom: 0 },
  mapBack: { position: "absolute", left: rider.gutter },
  sheet: {
    flex: 1,
    marginTop: -24,
    backgroundColor: colors.cream,
    borderTopLeftRadius: rider.radius.sheet,
    borderTopRightRadius: rider.radius.sheet,
  },
  sheetBody: { flexGrow: 1, gap: 14, paddingHorizontal: rider.gutter, paddingTop: 20, paddingBottom: 12 },
  offerCard: { gap: 12, paddingVertical: 16, paddingHorizontal: 18 },
  offerTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  offerWho: { flex: 1, minWidth: 0, gap: 2 },
  offerFigure: { fontSize: 36, lineHeight: 40 },
  offerMeta: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 8 },
  raise: { gap: 8 },
  waiting: {
    height: 60,
    borderRadius: rider.radius.lg,
    backgroundColor: colors.tint,
    alignItems: "center",
    justifyContent: "center",
  },

  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 6,
    minHeight: 48,
    borderRadius: rider.radius.md,
    backgroundColor: colors.dangerSoft,
  },
  errorText: { flex: 1 },

  pulseWrap: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: 140,
    height: 140,
    marginLeft: -70,
    marginTop: -70,
    alignItems: "center",
    justifyContent: "center",
  },
  pulseOuter: { top: 0, left: 0 },
  pulseInner: { top: 24, left: 24 },
  pulseDot: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
});
