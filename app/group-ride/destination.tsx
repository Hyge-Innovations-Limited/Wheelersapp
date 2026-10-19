import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import { AppButton } from "@/components/app-button";
import { AppScreen } from "@/components/app-screen";
import { AppText, OnLight } from "@/components/app-text";
import { BackArrow } from "@/components/back-arrow";
import type { GroupRideGenderPreference } from "@/lib/api";
import {
  fetchGooglePlaceSuggestions,
  isGoogleMapsConfigured,
  type PlaceSuggestion,
} from "@/lib/google-places";
import { useAppLocation } from "@/lib/location";
import {
  readRecentPlaceSearches,
  saveRecentPlaceSearch,
} from "@/lib/place-search-history";
import { theme } from "@/theme";

type ScreenMode = "launcher" | "route-search";
type ActiveField = "pickup" | "destination";

const SEARCH_DEBOUNCE_MS = 280;
const FORM_HISTORY_PREVIEW_LIMIT = 4;

function normalizeGenderPreference(
  value: string | string[] | undefined,
): GroupRideGenderPreference {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "women_only" || raw === "men_only" || raw === "any") {
    return raw;
  }

  return "any";
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
  if (!normalizedQuery) return true;

  return [
    place.title,
    place.subtitle,
    place.address,
    formatSuggestionValue(place),
  ].some((part) => normalizeSearchText(part).includes(normalizedQuery));
}

function isExactSearchMatch(place: PlaceSuggestion, query: string) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return false;

  return [place.title, place.address, formatSuggestionValue(place)].some(
    (part) => normalizeSearchText(part) === normalizedQuery,
  );
}

export default function GroupRideDestinationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ genderPreference?: string }>();
  const searchInputRef = useRef<TextInput>(null);
  const routeScrollRef = useRef<ScrollView>(null);
  const { currentLocation } = useAppLocation();

  const [mode, setMode] = useState<ScreenMode>("launcher");
  const [activeField, setActiveField] = useState<ActiveField>("destination");
  const [pickupValue, setPickupValue] = useState("");
  const [destinationValue, setDestinationValue] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [providerSuggestions, setProviderSuggestions] = useState<PlaceSuggestion[]>([]);
  const [recentPlaces, setRecentPlaces] = useState<PlaceSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const genderPreference = normalizeGenderPreference(params.genderPreference);

  useEffect(() => {
    if (!currentLocation?.address || pickupValue.trim().length > 0) {
      return;
    }

    setPickupValue(currentLocation.address);
  }, [currentLocation?.address, pickupValue]);

  useEffect(() => {
    let cancelled = false;

    void readRecentPlaceSearches().then((places) => {
      if (!cancelled) setRecentPlaces(places);
    });

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

  useEffect(() => {
    if (mode !== "route-search") return;

    const timeout = setTimeout(() => searchInputRef.current?.focus(), 50);
    return () => clearTimeout(timeout);
  }, [activeField, mode]);

  const trimmedSearchQuery = searchQuery.trim();

  const matchingRecentPlaces = useMemo(
    () => recentPlaces.filter((place) => matchesSearchQuery(place, trimmedSearchQuery)),
    [recentPlaces, trimmedSearchQuery],
  );

  const matchingRecentPlacesPreview = useMemo(
    () => matchingRecentPlaces.slice(0, FORM_HISTORY_PREVIEW_LIMIT),
    [matchingRecentPlaces],
  );

  const hasExactRecentMatch = useMemo(
    () => recentPlaces.some((place) => isExactSearchMatch(place, debouncedSearchQuery)),
    [debouncedSearchQuery, recentPlaces],
  );

  const shouldReuseCurrentRecentMatch = useMemo(
    () => recentPlaces.some((place) => isExactSearchMatch(place, searchQuery)),
    [recentPlaces, searchQuery],
  );

  const recentPlacesPreview = useMemo(
    () => recentPlaces.slice(0, FORM_HISTORY_PREVIEW_LIMIT),
    [recentPlaces],
  );

  useEffect(() => {
    if (!isGoogleMapsConfigured()) {
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
      setProviderSuggestions([]);
      setIsSearching(false);
      return;
    }

    let cancelled = false;
    setIsSearching(true);

    void (async () => {
      try {
        const suggestions = await fetchGooglePlaceSuggestions(normalized);
        if (!cancelled) setProviderSuggestions(suggestions);
      } catch {
        if (!cancelled) setProviderSuggestions([]);
      } finally {
        if (!cancelled) setIsSearching(false);
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
    const filtered = shouldUseProviderResults ? providerSuggestions : [];
    const seen = new Set<string>();

    return filtered.filter((item) => {
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
          !matchingRecentPlacesPreview.some((recent) =>
            isSamePlaceSuggestion(recent, item),
          ),
      ),
    [matchingRecentPlacesPreview, uniqueProviderSuggestions],
  );

  const hasCompleteRoute = pickupValue.trim().length > 0 && destinationValue.trim().length > 0;

  const searchPlaceholder =
    activeField === "pickup" ? "Search pickup" : "Search destination";

  const openRouteSearch = (field: ActiveField = "destination") => {
    setMode("route-search");
    focusRouteField(field);
  };

  const focusRouteField = (field: ActiveField) => {
    setActiveField(field);
    setSearchQuery("");
    requestAnimationFrame(() => {
      routeScrollRef.current?.scrollTo({ y: 0, animated: true });
    });
  };

  const writeToActiveField = (value: string) => {
    if (activeField === "pickup") {
      setPickupValue(value);
    } else {
      setDestinationValue(value);
    }
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    writeToActiveField(value);
  };

  const handleClearField = (field: ActiveField) => {
    if (field === "pickup") {
      setPickupValue("");
    } else {
      setDestinationValue("");
    }

    if (activeField === field) {
      setSearchQuery("");
    }
  };

  const handlePlaceSelection = (place: PlaceSuggestion) => {
    void saveRecentPlaceSearch(place)
      .then((next) => setRecentPlaces(next))
      .catch(() => {});

    Keyboard.dismiss();
    writeToActiveField(formatSuggestionValue(place));
    setSearchQuery("");
  };

  const handleBack = () => {
    if (mode === "route-search") {
      setMode("launcher");
      setSearchQuery("");
      return;
    }

    router.back();
  };

  const handleDoneEditingRoute = () => {
    if (!pickupValue.trim()) {
      focusRouteField("pickup");
      return;
    }

    if (!destinationValue.trim()) {
      focusRouteField("destination");
      return;
    }

    Keyboard.dismiss();
    setSearchQuery("");
    setMode("launcher");
  };

  const handleConfirm = () => {
    if (!hasCompleteRoute) {
      openRouteSearch(destinationValue.trim() ? "pickup" : "destination");
      return;
    }

    router.push({
      pathname: "/group-ride/matching",
      params: {
        pickup: pickupValue,
        destination: destinationValue,
        genderPreference,
      },
    });
  };

  return (
    <AppScreen
      backgroundColor={theme.colors.offWhite}
      scroll={false}
      contentStyle={styles.container}
    >
      <StatusBar style="dark" backgroundColor={theme.colors.offWhite} />

      <View style={styles.content}>
        {mode === "launcher" ? (
          <View style={styles.modeLayout}>
            <View style={styles.formTopBar}>
              <BackArrow onPress={handleBack} />
              <View style={styles.formTopCopy}>
                <AppText variant="monoSmall" color={theme.colors.muted}>
                  GROUP RIDE
                </AppText>
                <AppText variant="bodySmall" color={theme.colors.muted}>
                  Share your route with riders going your way
                </AppText>
              </View>
              <View style={styles.ridersChip}>
                <OnLight>
                <MaterialIcons name="group" size={14} color={theme.colors.orange} />
                <AppText variant="monoSmall" color={theme.colors.orange}>
                  SHARED
                </AppText>
                </OnLight>
              </View>
            </View>

            <ScrollView
              bounces={false}
              contentContainerStyle={styles.formScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <MainRouteCard
                destination={destinationValue}
                hasCompleteRoute={hasCompleteRoute}
                onPress={() => openRouteSearch("destination")}
                pickup={pickupValue}
              />

              <View style={styles.groupRideCard}>
                <OnLight>
                <View style={styles.groupRideIcon}>
                  <OnLight>
                  <MaterialIcons name="groups" size={18} color={theme.colors.black} />
                  </OnLight>
                </View>
                <View style={styles.groupRideCopy}>
                  <AppText variant="bodyMedium">Group ride matching</AppText>
                  <AppText variant="bodySmall" color={theme.colors.muted}>
                    We will find riders on a similar route so you can split the ride cost.
                  </AppText>
                </View>
                </OnLight>
              </View>

              {recentPlacesPreview.length > 0 ? (
                <View style={styles.historySection}>
                  <View style={styles.sectionHeading}>
                    <AppText variant="monoSmall" color={theme.colors.muted}>
                      HISTORY
                    </AppText>
                    <AppText variant="bodySmall" color={theme.colors.muted}>
                      Recent places saved on this device
                    </AppText>
                  </View>
                  <View style={styles.resultsListContent}>
                    {recentPlacesPreview.map((item, index) => (
                      <PlaceResultRow
                        icon="history"
                        item={item}
                        key={`${item.id}-${index}-launcher-history`}
                        onPress={() => {
                          setDestinationValue(formatSuggestionValue(item));
                          openRouteSearch("pickup");
                        }}
                      />
                    ))}
                  </View>
                </View>
              ) : null}
            </ScrollView>

            <View style={styles.footerActionBar}>
              <OnLight>
              <AppButton
                disabled={false}
                title={hasCompleteRoute ? "Find Group Ride" : "Continue"}
                onPress={handleConfirm}
              />
              </OnLight>
            </View>
          </View>
        ) : (
          <View style={styles.modeLayout}>
            <View style={styles.searchHeader}>
              <BackArrow onPress={handleBack} />
              <View style={styles.searchBar}>
                <OnLight>
                <MaterialIcons color={theme.colors.muted} name="search" size={18} />
                <TextInput
                  autoFocus
                  onChangeText={handleSearchChange}
                  placeholder={searchPlaceholder}
                  placeholderTextColor="#A59B92"
                  ref={searchInputRef}
                  style={styles.searchInput}
                  value={searchQuery}
                />
                {searchQuery.length > 0 ? (
                  <Pressable
                    onPress={() => handleSearchChange("")}
                    style={styles.inlineClearButton}
                  >
                    <OnLight>
                    <MaterialIcons color={theme.colors.black} name="close" size={15} />
                    </OnLight>
                  </Pressable>
                ) : null}
                </OnLight>
              </View>
            </View>

            <ScrollView
              bounces={false}
              contentContainerStyle={styles.searchScrollContent}
              keyboardShouldPersistTaps="handled"
              ref={routeScrollRef}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.formSheet}>
                <OnLight>
                <View style={styles.formConnector} />

                <RouteSelectRow
                  active={activeField === "pickup"}
                  color={theme.colors.green}
                  label="Pickup"
                  marker="circle"
                  onClear={() => handleClearField("pickup")}
                  onPress={() => focusRouteField("pickup")}
                  placeholder="Where from?"
                  value={pickupValue}
                />

                <RouteSelectRow
                  active={activeField === "destination"}
                  color={theme.colors.orange}
                  label="Destination"
                  marker="square"
                  onClear={() => handleClearField("destination")}
                  onPress={() => focusRouteField("destination")}
                  placeholder="Where to?"
                  value={destinationValue}
                />
                </OnLight>
              </View>

              <View style={styles.resultsSection}>
                {isSearching ? (
                  <View style={styles.emptyState}>
                    <AppText variant="bodyMedium">Searching places...</AppText>
                    <AppText variant="bodySmall" color={theme.colors.muted}>
                      Finding matching locations.
                    </AppText>
                  </View>
                ) : matchingRecentPlacesPreview.length > 0 || providerResults.length > 0 ? (
                  <View style={styles.resultsListContent}>
                    {trimmedSearchQuery.length === 0 && matchingRecentPlacesPreview.length > 0 ? (
                      <View style={styles.sectionHeading}>
                        <AppText variant="monoSmall" color={theme.colors.muted}>
                          HISTORY
                        </AppText>
                        <AppText variant="bodySmall" color={theme.colors.muted}>
                          Recent places saved on this device
                        </AppText>
                      </View>
                    ) : null}

                    {matchingRecentPlacesPreview.map((item, index) => (
                      <PlaceResultRow
                        icon="history"
                        item={item}
                        key={`${item.id}-${index}-search-history`}
                        onPress={() => handlePlaceSelection(item)}
                      />
                    ))}

                    {providerResults.map((item, index) => (
                      <PlaceResultRow
                        item={item}
                        key={`${item.id}-${index}-search-provider`}
                        onPress={() => handlePlaceSelection(item)}
                      />
                    ))}
                  </View>
                ) : trimmedSearchQuery.length > 0 ? (
                  <View style={styles.emptyState}>
                    <AppText variant="bodyMedium">No places found</AppText>
                    <AppText variant="bodySmall" color={theme.colors.muted}>
                      Keep typing to search for a location.
                    </AppText>
                  </View>
                ) : (
                  <View style={styles.historySection}>
                    <View style={styles.sectionHeading}>
                      <AppText variant="monoSmall" color={theme.colors.muted}>
                        HISTORY
                      </AppText>
                      <AppText variant="bodySmall" color={theme.colors.muted}>
                        Recent places saved on this device
                      </AppText>
                    </View>

                    {recentPlacesPreview.length > 0 ? (
                      <View style={styles.resultsListContent}>
                        {recentPlacesPreview.map((item, index) => (
                          <PlaceResultRow
                            icon="history"
                            item={item}
                            key={`${item.id}-${index}-empty-history`}
                            onPress={() => handlePlaceSelection(item)}
                          />
                        ))}
                      </View>
                    ) : (
                      <View style={styles.emptyState}>
                        <AppText variant="bodyMedium">Search Lagos addresses</AppText>
                        <AppText variant="bodySmall" color={theme.colors.muted}>
                          Start typing a street, estate, building, or bus stop.
                        </AppText>
                      </View>
                    )}
                  </View>
                )}
              </View>
            </ScrollView>

            <View style={styles.footerActionBar}>
              <OnLight>
              <AppButton
                disabled={false}
                title="Done"
                onPress={handleDoneEditingRoute}
              />
              </OnLight>
            </View>
          </View>
        )}
      </View>
    </AppScreen>
  );
}

function MainRouteCard({
  destination,
  hasCompleteRoute,
  onPress,
  pickup,
}: {
  destination: string;
  hasCompleteRoute: boolean;
  onPress: () => void;
  pickup: string;
}) {
  return (
    <Pressable onPress={onPress} style={styles.mainRouteCard}>
      <OnLight>
      <View style={styles.mainRouteIcon}>
        <OnLight>
        <MaterialIcons name="search" size={18} color={theme.colors.black} />
        </OnLight>
      </View>
      <View style={styles.mainRouteCopy}>
        <AppText variant="monoSmall" color={theme.colors.muted}>
          WHERE TO?
        </AppText>
        {hasCompleteRoute ? (
          <>
            <AppText numberOfLines={1} variant="bodyMedium">
              {destination}
            </AppText>
            <AppText numberOfLines={1} variant="bodySmall" color={theme.colors.muted}>
              From {pickup}
            </AppText>
          </>
        ) : destination ? (
          <>
            <AppText numberOfLines={1} variant="bodyMedium">
              {destination}
            </AppText>
            <AppText variant="bodySmall" color={theme.colors.muted}>
              Add your pickup to continue
            </AppText>
          </>
        ) : (
          <>
            <AppText variant="bodyMedium">Where are you going?</AppText>
            <AppText variant="bodySmall" color={theme.colors.muted}>
              Set your pickup and destination
            </AppText>
          </>
        )}
      </View>
      <MaterialIcons name="chevron-right" size={20} color={theme.colors.muted} />
      </OnLight>
    </Pressable>
  );
}

type RouteSelectRowProps = {
  active: boolean;
  color: string;
  label: string;
  marker: "circle" | "square";
  onClear: () => void;
  onPress: () => void;
  placeholder: string;
  value: string;
};

function RouteSelectRow({
  active,
  color,
  label,
  marker,
  onClear,
  onPress,
  placeholder,
  value,
}: RouteSelectRowProps) {
  const hasValue = value.trim().length > 0;

  return (
    <View style={styles.triggerFieldBlock}>
      <AppText variant="bodySmall" color={theme.colors.muted}>
        {label}
      </AppText>
      <Pressable
        onPress={onPress}
        style={[styles.triggerField, active ? styles.routeInputActive : null]}
      >
        <OnLight>
        <View
          style={[
            marker === "circle" ? styles.markerCircle : styles.markerSquare,
            { backgroundColor: color },
          ]}
        />
        <AppText numberOfLines={1} variant="body" style={styles.triggerText}>
          {value || (
            <AppText variant="body" color="#A59B92">
              {placeholder}
            </AppText>
          )}
        </AppText>
        {hasValue ? (
          <Pressable onPress={onClear} style={styles.inlineClearButton}>
            <OnLight>
            <MaterialIcons color={theme.colors.black} name="close" size={15} />
            </OnLight>
          </Pressable>
        ) : null}
        </OnLight>
      </Pressable>
    </View>
  );
}

function PlaceResultRow({
  icon,
  item,
  onPress,
}: {
  icon?: PlaceSuggestion["icon"];
  item: PlaceSuggestion;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.resultRow}>
      <OnLight>
      <View style={styles.resultIcon}>
        <OnLight>
        <MaterialIcons color={theme.colors.black} name={icon ?? item.icon} size={18} />
        </OnLight>
      </View>
      <View style={styles.resultCopy}>
        <AppText variant="bodyMedium">{item.title}</AppText>
        <AppText variant="bodySmall" color={theme.colors.muted}>
          {item.subtitle}
        </AppText>
      </View>
      </OnLight>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: theme.spacing.lg,
    paddingBottom: 0,
  },
  content: {
    flex: 1,
  },
  modeLayout: {
    flex: 1,
    gap: theme.spacing.md,
    overflow: "hidden",
  },
  formTopBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  formTopCopy: {
    flex: 1,
    gap: 2,
  },
  ridersChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 5,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.orange,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.orangeLight,
  },
  formScrollContent: {
    flexGrow: 1,
    paddingBottom: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  searchScrollContent: {
    flexGrow: 1,
    paddingBottom: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  footerActionBar: {
    paddingTop: theme.spacing.xs,
    paddingBottom: theme.spacing.xl,
    backgroundColor: theme.colors.offWhite,
  },
  mainRouteCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.white,
    ...theme.shadows.card,
  },
  mainRouteIcon: {
    width: 38,
    height: 38,
    borderRadius: theme.radius.pill,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.black,
    backgroundColor: "#FFF4EA",
    alignItems: "center",
    justifyContent: "center",
  },
  mainRouteCopy: {
    flex: 1,
    gap: 2,
  },
  groupRideCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    borderRadius: theme.radius.md,
    backgroundColor: "#FFF4EA",
    ...theme.shadows.card,
  },
  groupRideIcon: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.pill,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  groupRideCopy: {
    flex: 1,
    gap: 2,
  },
  formSheet: {
    position: "relative",
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.white,
    ...theme.shadows.card,
  },
  formConnector: {
    position: "absolute",
    left: 27,
    top: 56,
    width: 2,
    height: 78,
    backgroundColor: theme.colors.borderLight,
  },
  triggerFieldBlock: {
    gap: theme.spacing.xs,
  },
  triggerField: {
    minHeight: 54,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.white,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  triggerText: {
    flex: 1,
  },
  routeInputActive: {
    borderColor: theme.colors.orange,
    backgroundColor: "#FFF8F2",
  },
  inlineClearButton: {
    width: 26,
    height: 26,
    borderRadius: theme.radius.pill,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.white,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  markerCircle: {
    width: 8,
    height: 8,
    borderRadius: theme.radius.pill,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.black,
  },
  markerSquare: {
    width: 8,
    height: 8,
    borderRadius: 2,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.black,
  },
  searchHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  searchBar: {
    flex: 1,
    minHeight: 54,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.white,
    paddingHorizontal: theme.spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    ...theme.shadows.card,
  },
  searchInput: {
    flex: 1,
    fontFamily: theme.fonts.body,
    fontSize: 14,
    color: theme.colors.black,
    paddingVertical: 0,
  },
  resultsSection: {
    gap: theme.spacing.sm,
  },
  historySection: {
    gap: theme.spacing.sm,
  },
  sectionHeading: {
    gap: 2,
    paddingHorizontal: theme.spacing.xs,
  },
  resultsListContent: {
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.xs,
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.white,
    ...theme.shadows.card,
  },
  resultIcon: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.orangeLight,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.black,
    alignItems: "center",
    justifyContent: "center",
  },
  resultCopy: {
    flex: 1,
    gap: 1,
  },
  emptyState: {
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.xs,
  },
});
