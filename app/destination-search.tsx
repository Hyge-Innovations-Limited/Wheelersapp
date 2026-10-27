import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import { RBack, RButton, rider, RScreen, RText } from "@/components/rider/kit";
import { getAccessTokenWithRetry } from "@/lib/access-token";
import { getRideEstimate, isBackendConfigured } from "@/lib/api";
import type { RideEstimateResponse } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toUserMessage } from "@/lib/error-messages";
import {
  fetchGooglePlaceSuggestions,
  isGoogleMapsConfigured,
  rememberPickedPlace,
  resolvePlaceQuery,
  type PlaceSuggestion,
} from "@/lib/google-places";
import { useAppLocation } from "@/lib/location";
import {
  readRecentPlaceSearches,
  saveRecentPlaceSearch,
} from "@/lib/place-search-history";
import { useSavedPlaces } from "@/lib/saved-places";
import {
  serializeRideEstimate,
} from "@/lib/ride-estimate";
import {
  DEFAULT_DESTINATION_LABEL,
  DEFAULT_PICKUP_LABEL,
  isCurrentLocationLabel,
  MAX_ADDITIONAL_STOPS,
  parseRideItineraryParam,
  serializeRideItinerary,
  type RideItinerary,
} from "@/lib/ride-route";
import { useSearchAgainRedirect } from "@/hooks/use-search-again-redirect";
import { RouteChangeSheet } from "@/components/rider/route-change-sheet";
import { routeQuoteNeedsAsk, type RouteQuote } from "@/lib/route-quote";
import { useRideSession } from "@/lib/ride-session";

const { colors, fonts, radius } = rider;

// "pickup" targets the from field; a number targets routeStops[index]
// (intermediate stops + the final destination).
type InlineTarget = "pickup" | number;
type FlowMode = "booking" | "trip-edit";
type Route = { pickup: string; stops: string[] };

const SEARCH_DEBOUNCE_MS = 280;
const RECENT_PREVIEW_LIMIT = 5;

function firstParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

function formatSuggestionValue(item: { title: string; subtitle: string }) {
  return item.subtitle ? `${item.title}, ${item.subtitle}` : item.title;
}

function normalizeSearchText(value: string) {
  return value.trim().toLowerCase();
}

function isSamePlaceSuggestion(a: PlaceSuggestion, b: PlaceSuggestion) {
  return normalizeSearchText(a.address) === normalizeSearchText(b.address);
}

function matchesSearchQuery(place: PlaceSuggestion, query: string) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return true;
  }

  return [
    place.title,
    place.subtitle,
    place.address,
    formatSuggestionValue(place),
  ].some((part) => normalizeSearchText(part).includes(normalizedQuery));
}

function isExactSearchMatch(place: PlaceSuggestion, query: string) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return false;
  }

  return [
    place.title,
    place.address,
    formatSuggestionValue(place),
  ].some((part) => normalizeSearchText(part) === normalizedQuery);
}

function findFirstIncompleteTarget(route: Route): InlineTarget | null {
  if (!route.pickup.trim()) return "pickup";

  const emptyStopIndex = route.stops
    .slice(0, -1)
    .findIndex((stop) => stop.trim().length === 0);
  if (emptyStopIndex >= 0) return emptyStopIndex;

  const finalDestinationIndex = route.stops.length - 1;
  if (!route.stops[finalDestinationIndex]?.trim()) return finalDestinationIndex;

  return null;
}

function writeRouteValue(route: Route, target: InlineTarget, value: string): Route {
  if (target === "pickup") {
    return { pickup: value, stops: route.stops };
  }
  return {
    pickup: route.pickup,
    stops: route.stops.map((stop, index) => (index === target ? value : stop)),
  };
}

const placeIcons: Record<PlaceSuggestion["icon"], keyof typeof Ionicons.glyphMap> = {
  "location-on": "location-outline",
  storefront: "storefront-outline",
  flight: "airplane-outline",
  history: "time-outline",
};

export default function DestinationSearchScreen() {
  const router = useRouter();
  const { getAccessToken } = useAuth();
  const { updateRideRoute, quoteRideRoute } = useRideSession();
  /** A route change that moves money, waiting on the rider's yes: the route and its fare. */
  const [routeAsk, setRouteAsk] = useState<{ itinerary: RideItinerary; quote: RouteQuote } | null>(null);
  const [isUpdatingRoute, setIsUpdatingRoute] = useState(false);
  const params = useLocalSearchParams<{
    flowMode?: string | string[];
    itinerary?: string | string[];
    /** An address to start the To field with (a saved place). */
    destination?: string | string[];
    /** ISO time of a ride being scheduled; passed on to the price screen. */
    scheduledAt?: string | string[];
    /** Which address was tapped to get here: "pickup", "destination", or a stop's number (0 first). */
    edit?: string | string[];
    /**
     * Set each time the price screen sends the rider back here to change the
     * trip (it comes back to this same screen, never a new one on top), so
     * tapping the same address twice still opens it.
     */
    editAt?: string | string[];
  }>();
  const initialItinerary = useMemo(
    () => parseRideItineraryParam(params.itinerary),
    [params.itinerary],
  );
  const flowMode: FlowMode =
    firstParam(params.flowMode) === "trip-edit" ? "trip-edit" : "booking";
  // Changing a stop on a booked trip, and the driver pulled out (the search
  // goes on): back to the trip screen, which goes on to Finding drivers.
  useSearchAgainRedirect("back", flowMode === "trip-edit");
  const destinationParam = firstParam(params.destination);
  const scheduledAt = firstParam(params.scheduledAt);
  const seededItinerary = useMemo(() => {
    if (flowMode === "trip-edit") {
      return initialItinerary;
    }

    const pickup =
      initialItinerary.pickup === DEFAULT_PICKUP_LABEL
        ? ""
        : initialItinerary.pickup;
    const stops = initialItinerary.stops.map((stop, index) => {
      const isOnlyDefaultDestination =
        initialItinerary.stops.length === 1 &&
        index === 0 &&
        stop === DEFAULT_DESTINATION_LABEL;
      return isOnlyDefaultDestination ? "" : stop;
    });
    const seededStops = stops.length > 0 ? stops : [""];
    if (destinationParam) {
      seededStops[seededStops.length - 1] = destinationParam;
    }

    return {
      pickup,
      stops: seededStops,
    };
  }, [destinationParam, flowMode, initialItinerary]);

  const listScrollRef = useRef<ScrollView>(null);
  const inputRefs = useRef<Record<string, TextInput | null>>({});
  const [pickupValue, setPickupValue] = useState(seededItinerary.pickup);
  const { currentLocation, requestLocationAccess, refreshLocation } = useAppLocation();

  // Show the rider where they will actually be collected. The pickup field
  // used to sit on a hardcoded neighbourhood, so a rider anywhere else was
  // quietly booked from the wrong side of the city.
  // It follows the phone while the rider leaves it alone: a sharper fix that
  // lands a moment later updates the address too, not only the first guess.
  const autoPickupRef = useRef<string | null>(null);
  useEffect(() => {
    const address = currentLocation?.address;
    if (!address) return;
    setPickupValue((existing) => {
      if (!isCurrentLocationLabel(existing) && existing !== autoPickupRef.current) return existing;
      autoPickupRef.current = address;
      return address;
    });
  }, [currentLocation?.address]);
  const [routeStops, setRouteStops] = useState(seededItinerary.stops);
  // What is being typed into the active field. It becomes that field's value
  // when a place is picked, the keyboard's search key is pressed, the rider
  // moves to another field, or they continue.
  const [searchQuery, setSearchQuery] = useState("");
  const [isDraftDirty, setIsDraftDirty] = useState(false);
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [providerSuggestions, setProviderSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [recentPlaces, setRecentPlaces] = useState<PlaceSuggestion[]>([]);
  const { places: savedPlaces } = useSavedPlaces();
  const [isSearching, setIsSearching] = useState(false);
  // Which field is currently being edited.
  const [activeInline, setActiveInline] = useState<InlineTarget | null>(null);
  const [isSubmittingRoute, setIsSubmittingRoute] = useState(false);
  const [prefetchedEstimate, setPrefetchedEstimate] = useState<{
    key: string;
    estimate: RideEstimateResponse;
  } | null>(null);
  const estimateRequestRef = useRef(0);

  const destinationValue = routeStops[routeStops.length - 1] ?? "";
  const intermediateStops = routeStops.slice(0, -1);
  const destinationIndex = routeStops.length - 1;

  useEffect(() => {
    let cancelled = false;

    const loadRecentPlaces = async () => {
      const storedPlaces = await readRecentPlaceSearches();
      if (!cancelled) {
        setRecentPlaces(storedPlaces);
      }
    };

    void loadRecentPlaces();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timeout);
  }, [searchQuery]);

  const trimmedSearchQuery = searchQuery.trim();
  const matchingRecentPlaces = useMemo(
    () => recentPlaces.filter((place) => matchesSearchQuery(place, trimmedSearchQuery)),
    [recentPlaces, trimmedSearchQuery],
  );
  const matchingRecentPlacesPreview = useMemo(
    () => matchingRecentPlaces.slice(0, RECENT_PREVIEW_LIMIT),
    [matchingRecentPlaces],
  );
  const hasExactRecentMatch = useMemo(
    () =>
      recentPlaces.some((place) =>
        isExactSearchMatch(place, debouncedSearchQuery),
      ),
    [debouncedSearchQuery, recentPlaces],
  );
  const shouldReuseCurrentRecentMatch = useMemo(
    () =>
      recentPlaces.some((place) =>
        isExactSearchMatch(place, searchQuery),
      ),
    [recentPlaces, searchQuery],
  );

  // Google place search runs whenever the current query changes.
  //
  // Every early return below is logged, because they are indistinguishable on
  // screen: the list just stays empty. Filter the console for `[search]`.
  useEffect(() => {
    if (!isGoogleMapsConfigured()) {
      if (__DEV__) console.log("[search] skipped — no Google Maps key in this build");
      setProviderSuggestions([]);
      setIsSearching(false);
      return;
    }

    const normalized = debouncedSearchQuery.trim();

    if (!normalized) {
      setProviderSuggestions([]);
      setIsSearching(false);
      return;
    }

    if (hasExactRecentMatch) {
      // A recent place already matches this text exactly, so the history row is
      // shown instead of asking Google the same question.
      if (__DEV__) {
        console.log("[search] skipped — an exact recent place already matches", {
          query: normalized,
        });
      }
      setProviderSuggestions([]);
      setIsSearching(false);
      return;
    }

    let cancelled = false;
    setIsSearching(true);
    setSearchError(null);

    void (async () => {
      try {
        if (__DEV__) console.log("[search] asking Google for", normalized);
        const suggestions = await fetchGooglePlaceSuggestions(normalized);
        if (!cancelled) {
          if (__DEV__) {
            console.log(`[search] got ${suggestions.length} suggestion(s)`);
          }
          setProviderSuggestions(suggestions);
        }
      } catch (searchError) {
        if (!cancelled) {
          // A failed search is not an empty search: a missing API key, a denied
          // request and "no such place" must not all look like an empty list.
          if (__DEV__) console.warn("[search] failed", searchError);
          setProviderSuggestions([]);
          setSearchError(
            toUserMessage(searchError, "We could not search for places just now."),
          );
        }
      } finally {
        if (!cancelled) {
          setIsSearching(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [debouncedSearchQuery, hasExactRecentMatch]);

  const shouldUseProviderResults =
    isGoogleMapsConfigured() &&
    trimmedSearchQuery.length > 0 &&
    !shouldReuseCurrentRecentMatch;

  const uniqueProviderSuggestions = useMemo(() => {
    const filteredSuggestions = shouldUseProviderResults ? providerSuggestions : [];
    const seen = new Set<string>();
    return filteredSuggestions.filter((item) => {
      const key = `${item.id}:${item.title}:${item.subtitle}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [providerSuggestions, shouldUseProviderResults]);
  const providerResults = useMemo(
    () =>
      uniqueProviderSuggestions.filter(
        (item) =>
          !matchingRecentPlacesPreview.some((recentPlace) =>
            isSamePlaceSuggestion(recentPlace, item),
          ),
      ),
    [matchingRecentPlacesPreview, uniqueProviderSuggestions],
  );

  /* ── moving between the fields ──────────────────────────────────────── */

  const currentRoute = (): Route => ({ pickup: pickupValue, stops: routeStops });

  /** The route with whatever is half-typed in the active field written in. */
  const routeWithDraft = (): Route => {
    const route = currentRoute();
    if (activeInline === null || !isDraftDirty) return route;
    return writeRouteValue(route, activeInline, searchQuery.trim());
  };

  const applyRoute = (route: Route) => {
    setPickupValue(route.pickup);
    setRouteStops(route.stops);
  };

  const resetDraft = () => {
    setSearchQuery("");
    setIsDraftDirty(false);
  };

  /** Make a field the active one and put the cursor in it. */
  const moveTo = (target: InlineTarget, delayMs = 50) => {
    setActiveInline(target);
    resetDraft();
    setTimeout(() => {
      listScrollRef.current?.scrollTo({ y: 0, animated: false });
      inputRefs.current[String(target)]?.focus();
    }, delayMs);
  };

  /** The rider tapped into a field themselves. */
  const handleFieldFocus = (target: InlineTarget) => {
    if (activeInline === target) return;
    applyRoute(routeWithDraft());
    setActiveInline(target);
    resetDraft();
  };

  const handleFieldChange = (target: InlineTarget, value: string) => {
    if (activeInline !== target) {
      applyRoute(routeWithDraft());
      setActiveInline(target);
    }
    setSearchQuery(value);
    setIsDraftDirty(true);
  };

  // Booking opens with the cursor in To (or in whichever field still needs
  // filling); changing a trip in progress opens showing the whole route.
  // Coming back from the price screen (editAt) does the same, with the trip
  // that screen was showing: this screen is returned to, not opened again,
  // so Back always goes price → search → home.
  const editAt = firstParam(params.editAt);
  const openedRef = useRef(false);
  useEffect(() => {
    if (flowMode !== "booking") return;
    if (openedRef.current) {
      // Keep the pickup found from the phone when the trip carried none.
      applyRoute({ pickup: seededItinerary.pickup || pickupValue, stops: seededItinerary.stops });
      setIsSubmittingRoute(false);
    }
    openedRef.current = true;
    const missing = findFirstIncompleteTarget(seededItinerary);
    // An address tapped on the price screen opens on that address, ready to type over.
    const wanted = Array.isArray(params.edit) ? params.edit[0] : params.edit;
    const last = seededItinerary.stops.length - 1;
    const tapped: InlineTarget | null =
      wanted === "pickup"
        ? "pickup"
        : wanted === "destination"
          ? last
          : wanted !== undefined && /^\d+$/.test(wanted) && Number(wanted) <= last
            ? Number(wanted)
            : null;
    moveTo(tapped ?? missing ?? last, 320);
    // When the screen opens, and each time the price screen sends the rider back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editAt]);

  /* ── the estimate, fetched ahead ────────────────────────────────────── */

  // Eager prefetch: resolve geocodes + call getRideEstimate as soon as pickup & destination are set
  useEffect(() => {
    const pickup = pickupValue.trim();
    const destination = destinationValue.trim();
    if (!pickup || !destination || !isBackendConfigured()) return;

    const requestId = ++estimateRequestRef.current;
    const key = serializeRideItinerary({ pickup: pickupValue, stops: routeStops });
    let cancelled = false;

    void (async () => {
      try {
        const accessToken = await getAccessTokenWithRetry(getAccessToken);
        if (!accessToken || cancelled) return;

        const [resolvedPickup, resolvedDest, ...resolvedStops] = await Promise.all([
          resolvePlaceQuery(pickup),
          resolvePlaceQuery(destination),
          ...intermediateStops
            .filter((s) => s.trim().length > 0)
            .map((s) => resolvePlaceQuery(s)),
        ]);

        if (cancelled || estimateRequestRef.current !== requestId) return;

        const response = await getRideEstimate({
          accessToken,
          pickup: resolvedPickup,
          destination: resolvedDest,
          stops: resolvedStops,
        });

        if (!cancelled && estimateRequestRef.current === requestId) {
          setPrefetchedEstimate({ key, estimate: response });
        }
      } catch {
        // Non-blocking — ride-selection will fetch its own estimate
      }
    })();

    return () => { cancelled = true; };
  // Debounce: only re-trigger when the user settles on both fields
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickupValue, destinationValue, intermediateStops.length]);

  /* ── leaving with a route ───────────────────────────────────────────── */

  const continueToPrice = (route: Route) => {
    const itinerary: RideItinerary = { pickup: route.pickup, stops: route.stops };
    const serializedItinerary = serializeRideItinerary(itinerary);
    // An estimate fetched for an earlier version of the route is not this
    // route's estimate; the price screen fetches its own when given the
    // instant one.
    // The quote fetched for this exact route, if it is in; otherwise the price
    // screen picks up the request already on its way. Never a made-up figure.
    const estimate =
      prefetchedEstimate && prefetchedEstimate.key === serializedItinerary ? prefetchedEstimate.estimate : null;

    Keyboard.dismiss();
    router.push({
      pathname: "/ride-selection",
      params: {
        itinerary: serializedItinerary,
        ...(estimate ? { estimate: serializeRideEstimate(estimate) } : {}),
        ...(scheduledAt ? { scheduledAt } : null),
      },
    });
  };

  const handleConfirmRoute = async () => {
    const route = routeWithDraft();
    applyRoute(route);

    const missingTarget = findFirstIncompleteTarget(route);
    if (missingTarget !== null) {
      moveTo(missingTarget);
      return;
    }

    resetDraft();

    if (flowMode === "trip-edit") {
      const itinerary: RideItinerary = { pickup: route.pickup, stops: route.stops };
      setIsSubmittingRoute(true);
      try {
        // Priced first: when the fare changes, the rider says yes before any
        // money moves. A server that does not quote: as before.
        const quote = await quoteRideRoute(itinerary);
        if (quote && routeQuoteNeedsAsk(quote)) {
          setRouteAsk({ itinerary, quote });
          return;
        }
        const result = await updateRideRoute(itinerary, quote?.fareNgn);
        if (result.kind === "price_changed") {
          setRouteAsk({ itinerary, quote: result.quote });
          return;
        }
        backToTrip(itinerary);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Could not update the ride route.";
        Alert.alert("Route update failed", message);
      } finally {
        setIsSubmittingRoute(false);
      }
      return;
    }

    continueToPrice(route);
  };

  /** Back to the trip screen this came from, with the route: not a second trip screen on top. */
  const backToTrip = (itinerary: RideItinerary) => {
    router.dismissTo({
      pathname: "/rider/active-trip",
      params: { itinerary: serializeRideItinerary(itinerary) },
    });
  };

  /** "Update route" on the sheet: at the fare shown; a newer one is asked about again. */
  const confirmRouteChange = async () => {
    if (!routeAsk || isUpdatingRoute) return;
    setIsUpdatingRoute(true);
    try {
      const result = await updateRideRoute(routeAsk.itinerary, routeAsk.quote.fareNgn);
      if (result.kind === "price_changed") {
        setRouteAsk({ itinerary: routeAsk.itinerary, quote: result.quote });
        return;
      }
      const itinerary = routeAsk.itinerary;
      setRouteAsk(null);
      backToTrip(itinerary);
    } catch (error) {
      setRouteAsk(null);
      Alert.alert("Route update failed", error instanceof Error ? error.message : "Could not update the ride route.");
    } finally {
      setIsUpdatingRoute(false);
    }
  };

  /** "Keep my trip": nothing changes; back to the trip as it was. */
  const keepTrip = () => {
    setRouteAsk(null);
    if (router.canGoBack()) router.back();
  };

  /* ── choosing a place ───────────────────────────────────────────────── */

  const handleSuggestionPress = (value: string) => {
    const target = activeInline ?? destinationIndex;
    const nextRoute = writeRouteValue(currentRoute(), target, value);

    applyRoute(nextRoute);
    resetDraft();

    const nextIncompleteTarget = findFirstIncompleteTarget(nextRoute);
    if (nextIncompleteTarget !== null) {
      // Keep the rider here until every field is filled.
      moveTo(nextIncompleteTarget);
      return;
    }

    if (flowMode === "booking") {
      if (target === nextRoute.stops.length - 1) {
        // The destination was the last thing missing: on to the price.
        Keyboard.dismiss();
        setActiveInline(null);
        continueToPrice(nextRoute);
        return;
      }
      if (target === "pickup") {
        moveTo(nextRoute.stops.length - 1);
        return;
      }
    }

    Keyboard.dismiss();
    setActiveInline(null);
  };

  const handlePlaceSelection = (place: PlaceSuggestion) => {
    void saveRecentPlaceSearch(place)
      .then((next) => setRecentPlaces(next))
      .catch(() => {});

    // The exact spot of what was picked, by its Google id, under the words shown.
    const value = formatSuggestionValue(place);
    rememberPickedPlace(value, place.id);
    handleSuggestionPress(value);
  };

  const handleSearchSubmit = () => {
    const value = searchQuery.trim();
    if (isDraftDirty && value) {
      handleSuggestionPress(value);
      return;
    }
    if (findFirstIncompleteTarget(routeWithDraft()) === null) {
      void handleConfirmRoute();
    }
  };

  const handleUseCurrentLocation = () => {
    if (currentLocation?.address) {
      handleSuggestionPress(currentLocation.address);
      return;
    }
    // No fix yet: ask for it. An empty From takes the address once it arrives.
    setPickupValue("");
    resetDraft();
    void requestLocationAccess().then(() => refreshLocation());
  };

  /** Empties From and leaves the cursor there, with "Use my current location" one tap below. */
  const handleClearPickup = () => {
    applyRoute(writeRouteValue(currentRoute(), "pickup", ""));
    moveTo("pickup");
  };

  const handleClearDestination = () => {
    const route = writeRouteValue(currentRoute(), destinationIndex, "");
    applyRoute(route);
    moveTo(destinationIndex);
  };

  const canAddStop =
    intermediateStops.length < MAX_ADDITIONAL_STOPS &&
    intermediateStops.every((stop) => stop.trim().length > 0);
  const maxStopsReached = intermediateStops.length >= MAX_ADDITIONAL_STOPS;

  const handleAddStop = () => {
    if (!canAddStop) return;

    const route = routeWithDraft();
    const insertIndex = route.stops.length - 1;
    const stops = [...route.stops];
    stops.splice(insertIndex, 0, "");
    applyRoute({ pickup: route.pickup, stops });
    moveTo(insertIndex, 80);
  };

  const handleRemoveStop = (index: number) => {
    if (intermediateStops.length === 0) return;

    if (typeof activeInline === "number") {
      if (activeInline === index) {
        resetDraft();
        setActiveInline(null);
      } else if (activeInline > index) {
        setActiveInline(activeInline - 1);
      }
    }

    setRouteStops((current) => current.filter((_, i) => i !== index));
  };

  /* ── what the list shows ────────────────────────────────────────────── */

  const isTyping = trimmedSearchQuery.length > 0;
  const fromIsActive = activeInline === "pickup";
  const listedRecents = isTyping
    ? matchingRecentPlacesPreview
    : recentPlaces.slice(0, RECENT_PREVIEW_LIMIT);
  const listedProviderResults = isTyping ? providerResults : [];
  // Before anything is typed the list is never bare: saved places, then recent ones.
  const listedSaved = isTyping ? [] : savedPlaces;
  const hasResults = listedRecents.length > 0 || listedProviderResults.length > 0;
  const heading = isTyping
    ? "MATCHING PLACES"
    : fromIsActive
      ? "PICKUP"
      : listedSaved.length > 0 || listedRecents.length > 0
        ? "YOUR PLACES"
        : "";

  const fieldText = (target: InlineTarget, committed: string) =>
    activeInline === target && isDraftDirty ? searchQuery : committed;
  const destinationText = fieldText(destinationIndex, destinationValue);
  const pickupText = fieldText("pickup", pickupValue);

  return (
    <RScreen contentStyle={styles.container} scroll={false}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <RBack />
        <RText accessibilityRole="header" style={styles.title} variant="heading">
          {flowMode === "trip-edit" ? "Change your route" : "Plan your trip"}
        </RText>
      </View>

      <View style={styles.card}>
        <RouteField
          accessory={
            pickupText.length > 0 ? (
              <Pressable
                accessibilityLabel="Clear pickup"
                accessibilityRole="button"
                onPress={handleClearPickup}
                style={({ pressed }) => [styles.fieldButton, pressed ? styles.pressed : null]}>
                <Ionicons color={colors.muted} name="close-circle" size={21} />
              </Pressable>
            ) : null
          }
          active={fromIsActive}
          inputRef={(node) => {
            inputRefs.current.pickup = node;
          }}
          label="FROM"
          marker="dot"
          onChangeText={(value) => handleFieldChange("pickup", value)}
          onFocus={() => handleFieldFocus("pickup")}
          onSubmit={handleSearchSubmit}
          placeholder="Search pickup"
          value={pickupText}
        />

        {intermediateStops.map((stop, index) => (
          <RouteField
            accessory={
              <Pressable
                accessibilityLabel={`Remove stop ${index + 1}`}
                accessibilityRole="button"
                onPress={() => handleRemoveStop(index)}
                style={({ pressed }) => [styles.fieldButton, pressed ? styles.pressed : null]}>
                <Ionicons color={colors.muted} name="trash-outline" size={19} />
              </Pressable>
            }
            active={activeInline === index}
            inputRef={(node) => {
              inputRefs.current[String(index)] = node;
            }}
            key={`route-stop-${index}`}
            label={`STOP ${index + 1}`}
            marker="ring"
            onChangeText={(value) => handleFieldChange(index, value)}
            onFocus={() => handleFieldFocus(index)}
            onSubmit={handleSearchSubmit}
            placeholder="Search stop"
            value={fieldText(index, stop)}
          />
        ))}

        <RouteField
          accessory={
            destinationText.length > 0 ? (
              <Pressable
                accessibilityLabel="Clear destination"
                accessibilityRole="button"
                onPress={handleClearDestination}
                style={({ pressed }) => [styles.fieldButton, pressed ? styles.pressed : null]}>
                <Ionicons color={colors.muted} name="close-circle" size={21} />
              </Pressable>
            ) : null
          }
          active={activeInline === destinationIndex}
          inputRef={(node) => {
            inputRefs.current[String(destinationIndex)] = node;
          }}
          label="TO"
          last
          marker="square"
          onChangeText={(value) => handleFieldChange(destinationIndex, value)}
          onFocus={() => handleFieldFocus(destinationIndex)}
          onSubmit={handleSearchSubmit}
          placeholder="Where are you going?"
          value={destinationText}
        />
      </View>

      <View style={styles.listHead}>
        <RText style={styles.flexText} variant="label">
          {heading}
        </RText>
        {isSearching ? <ActivityIndicator color={colors.orangeText} size="small" /> : null}
        <Pressable
          accessibilityLabel={maxStopsReached ? "Maximum stops reached" : "Add stop"}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canAddStop }}
          disabled={!canAddStop}
          onPress={handleAddStop}
          style={({ pressed }) => [
            styles.addStop,
            !canAddStop ? styles.dimmed : null,
            pressed ? styles.pressed : null,
          ]}>
          {maxStopsReached ? null : <Ionicons color={colors.orangeText} name="add" size={18} />}
          <RText color={colors.orangeText} variant="smallBold">
            {maxStopsReached ? "Maximum stops reached" : "Add stop"}
          </RText>
        </Pressable>
      </View>

      <ScrollView
        bounces={false}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        ref={listScrollRef}
        showsVerticalScrollIndicator={false}
        style={styles.list}>
        {fromIsActive && !isTyping ? (
          <Pressable
            accessibilityRole="button"
            onPress={handleUseCurrentLocation}
            style={({ pressed }) => [styles.resultRow, pressed ? styles.pressed : null]}>
            <View style={[styles.resultIcon, styles.resultIconInk]}>
              <Ionicons color={colors.orange} name="locate" size={19} />
            </View>
            <View style={styles.flexText}>
              <RText numberOfLines={1} variant="bodyBold">
                Use my current location
              </RText>
              <RText color={colors.muted} numberOfLines={1} variant="small">
                {currentLocation?.address ?? "Turn on location to use this"}
              </RText>
            </View>
          </Pressable>
        ) : null}

        {/* A failed search is not an empty search. */}
        {isTyping && searchError && !isSearching ? (
          <View accessibilityLiveRegion="polite" style={styles.searchError}>
            <Ionicons color={colors.danger} name="alert-circle-outline" size={18} />
            <RText color={colors.danger} style={styles.flexText} variant="small">
              {searchError}
            </RText>
          </View>
        ) : null}

        {listedSaved.map((place) => (
          <Pressable
            accessibilityRole="button"
            key={`${place.id}-saved`}
            onPress={() => handleSuggestionPress(place.address)}
            style={({ pressed }) => [styles.resultRow, pressed ? styles.pressed : null]}>
            <View style={styles.resultIcon}>
              <Ionicons
                color={colors.ink}
                name={/^home$/i.test(place.label) ? "home-outline" : /^work$/i.test(place.label) ? "briefcase-outline" : "bookmark-outline"}
                size={19}
              />
            </View>
            <View style={styles.flexText}>
              <RText numberOfLines={1} variant="bodyBold">
                {place.label}
              </RText>
              <RText color={colors.muted} numberOfLines={1} variant="small">
                {place.address}
              </RText>
            </View>
          </Pressable>
        ))}

        {!isTyping && !fromIsActive && listedSaved.length === 0 && listedRecents.length === 0 ? (
          <RText color={colors.muted} style={styles.nothing}>
            Type a street, an area or a landmark. Places you pick show here next time.
          </RText>
        ) : null}

        {listedRecents.map((item, index) => (
          <PlaceResultRow
            icon="time-outline"
            item={item}
            key={`${item.id}-${index}-recent`}
            onPress={() => handlePlaceSelection(item)}
          />
        ))}
        {listedProviderResults.map((item, index) => (
          <PlaceResultRow
            icon={placeIcons[item.icon]}
            item={item}
            key={`${item.id}-${index}-provider`}
            onPress={() => handlePlaceSelection(item)}
          />
        ))}

        {isTyping && !hasResults && !isSearching && !searchError && debouncedSearchQuery === searchQuery ? (
          <RText color={colors.muted} style={styles.nothing}>
            No place found. Check the spelling.
          </RText>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <RButton
          loading={isSubmittingRoute}
          onPress={() => void handleConfirmRoute()}
          title={flowMode === "trip-edit" ? "Update trip route" : "Continue"}
        />
      </View>

      <RouteChangeSheet
        busy={isUpdatingRoute}
        onKeep={keepTrip}
        onUpdate={() => void confirmRouteChange()}
        quote={routeAsk?.quote ?? null}
      />
    </RScreen>
  );
}

/* ── pieces ────────────────────────────────────────────────────────────── */

function RouteField({
  accessory,
  active,
  inputRef,
  label,
  last,
  marker,
  onChangeText,
  onFocus,
  onSubmit,
  placeholder,
  value,
}: {
  accessory?: ReactNode;
  active: boolean;
  inputRef: (node: TextInput | null) => void;
  label: string;
  last?: boolean;
  marker: "dot" | "ring" | "square";
  onChangeText: (value: string) => void;
  onFocus: () => void;
  onSubmit: () => void;
  placeholder: string;
  value: string;
}) {
  return (
    <View>
      <View style={styles.field}>
        <View
          style={[
            styles.marker,
            marker === "dot" ? styles.markerDot : marker === "ring" ? styles.markerRing : styles.markerSquare,
          ]}
        />
        <RText maxFontSizeMultiplier={1.1} style={styles.fieldLabel}>
          {label}
        </RText>
        <TextInput
          accessibilityLabel={label === "FROM" ? "From" : label === "TO" ? "To" : label}
          autoCapitalize="words"
          autoCorrect={false}
          maxFontSizeMultiplier={1.2}
          onChangeText={onChangeText}
          onFocus={onFocus}
          onSubmitEditing={onSubmit}
          placeholder={placeholder}
          placeholderTextColor="#8C837A"
          ref={inputRef}
          returnKeyType="search"
          selectTextOnFocus
          style={styles.fieldInput}
          submitBehavior="submit"
          value={value}
        />
        {accessory}
      </View>
      {active ? (
        <View style={styles.activeBar} />
      ) : (
        <View style={[styles.divider, last ? styles.dividerHidden : null]} />
      )}
    </View>
  );
}

function PlaceResultRow({
  icon,
  item,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  item: PlaceSuggestion;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={formatSuggestionValue(item)}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.resultRow, pressed ? styles.pressed : null]}>
      <View style={styles.resultIcon}>
        <Ionicons color={colors.orangeText} name={icon} size={19} />
      </View>
      <View style={styles.flexText}>
        <RText numberOfLines={1} variant="bodyBold">
          {item.title}
        </RText>
        {item.subtitle ? (
          <RText color={colors.muted} numberOfLines={1} variant="small">
            {item.subtitle}
          </RText>
        ) : null}
      </View>
      <Ionicons color={colors.muted} name="chevron-forward" size={16} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 12,
    paddingBottom: 0,
    paddingHorizontal: 16,
    gap: 12,
  },
  pressed: { opacity: 0.72 },
  dimmed: { opacity: 0.45 },
  flexText: { flex: 1, minWidth: 0 },

  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: { flex: 1, fontSize: 24, lineHeight: 28 },

  card: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.ink,
  },
  field: { flexDirection: "row", alignItems: "center", gap: 12 },
  marker: { width: 12, height: 12 },
  markerDot: { borderRadius: 6, backgroundColor: colors.ink },
  markerRing: { borderRadius: 6, borderWidth: 3, borderColor: colors.ink },
  markerSquare: { borderRadius: 3, backgroundColor: colors.orange },
  fieldLabel: {
    width: 48,
    flexShrink: 0,
    fontFamily: fonts.bold,
    fontSize: 12,
    lineHeight: 16,
    color: colors.muted,
  },
  fieldInput: {
    flex: 1,
    minWidth: 0,
    height: 44,
    padding: 0,
    fontFamily: fonts.semibold,
    fontSize: 16,
    letterSpacing: 0,
    color: colors.ink,
  },
  fieldButton: {
    width: 44,
    height: 44,
    marginRight: -10,
    alignItems: "center",
    justifyContent: "center",
  },
  activeBar: { height: 3, borderRadius: 2, backgroundColor: colors.orange },
  divider: { height: 1, marginVertical: 1, backgroundColor: colors.line },
  dividerHidden: { backgroundColor: "transparent" },

  listHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  addStop: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44 },

  list: { flex: 1, marginTop: -10 },
  listContent: { paddingBottom: 12 },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 56,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  resultIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.orangeSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  resultIconInk: { backgroundColor: colors.ink },
  nothing: { paddingVertical: 16, fontSize: 15, lineHeight: 22 },
  searchError: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 8,
    padding: 12,
    borderRadius: radius.sm,
    backgroundColor: colors.dangerSoft,
  },

  footer: { paddingTop: 4, paddingBottom: 16 },
});
