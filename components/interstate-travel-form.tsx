import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import Animated, { FadeIn, FadeInDown, Layout } from "react-native-reanimated";

import { AppButton } from "@/components/app-button";
import { AppText, OnLight } from "@/components/app-text";
import { getAccessTokenWithRetry, type AccessTokenGetter } from "@/lib/access-token";
import { toUserMessage } from "@/lib/error-messages";
import { createIdempotencyKey } from "@/lib/idempotency";
import {
  createTravelRequest,
  formatNaira,
  formatTravelDuration,
  isBidBelowFare,
  listInterstateDestinations,
  listInterstateOrigins,
  listInterstateVehicles,
  minimumOfferNgn,
  type InterstateDestination,
  type InterstateOrigin,
  type InterstateRouteRef,
  type InterstateVehicleOption,
} from "@/lib/interstate";
import { theme } from "@/theme";

/** How much one tap moves the bid. */
const BID_STEP_NGN = 500;

/** How far ahead a rider can schedule. */
const MAX_DAYS_AHEAD = 30;

type Mode = "alone" | "together";

/**
 * The travel form: where from, where to, when, in what, and for how much.
 *
 * This replaces a screen that showed a row of city chips and, on a database
 * with no routes in it, the words "No routes available" — with no way to say
 * where you were going. A rider arrives knowing their journey; the form asks
 * for it in the order they already have it in their head.
 *
 * Both ways of travelling are a bid, which is the part that makes this a
 * marketplace rather than a ticket counter:
 *
 *  • **Just me** brings a whole car. You bid for the vehicle.
 *  • **Share the ride** puts you on a vehicle with others. You bid for a seat.
 *
 * Either way, offering the posted fare books it outright and offering less
 * sends it to drivers, where nothing is charged until one accepts.
 */
export function InterstateTravelForm({
  getAccessToken,
  onSubmitted,
}: {
  getAccessToken: AccessTokenGetter;
  onSubmitted: () => void;
}) {
  const [origins, setOrigins] = useState<InterstateOrigin[]>([]);
  const [destinations, setDestinations] = useState<InterstateDestination[]>([]);
  const [origin, setOrigin] = useState<InterstateOrigin | null>(null);
  const [destination, setDestination] = useState<InterstateDestination | null>(null);

  const [departureAt, setDepartureAt] = useState<Date>(() => {
    // Default to tomorrow morning: nobody books a 300 km journey for "now",
    // and the backend refuses anything inside the next 30 minutes anyway.
    const next = new Date();
    next.setDate(next.getDate() + 1);
    next.setHours(7, 0, 0, 0);
    return next;
  });

  const [mode, setMode] = useState<Mode>("together");
  const [seats, setSeats] = useState(1);
  const [route, setRoute] = useState<InterstateRouteRef | null>(null);
  const [ratePerKmNgn, setRatePerKmNgn] = useState<number | null>(null);
  const [vehicles, setVehicles] = useState<InterstateVehicleOption[]>([]);
  const [vehicleType, setVehicleType] = useState<string | null>(null);
  const [bidNgn, setBidNgn] = useState<number | null>(null);

  const [picker, setPicker] = useState<"from" | "to" | null>(null);
  const [isLoadingCities, setIsLoadingCities] = useState(true);
  const [isPricing, setIsPricing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* ── where we travel ───────────────────────────────────────────────────── */

  const loadOrigins = useCallback(async () => {
    setIsLoadingCities(true);
    setError(null);
    try {
      const accessToken = await getAccessTokenWithRetry(getAccessToken);
      if (!accessToken) throw new Error("Please sign in again.");
      const result = await listInterstateOrigins(accessToken);
      setOrigins(result.origins);
    } catch (loadError) {
      setError(toUserMessage(loadError, "We could not load the cities we travel from."));
    } finally {
      setIsLoadingCities(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    void loadOrigins();
  }, [loadOrigins]);

  const chooseOrigin = useCallback(
    async (next: InterstateOrigin) => {
      void Haptics.selectionAsync();
      setOrigin(next);
      setDestination(null);
      setDestinations([]);
      setVehicles([]);
      setVehicleType(null);
      setBidNgn(null);
      setPicker(null);
      setError(null);

      try {
        const accessToken = await getAccessTokenWithRetry(getAccessToken);
        if (!accessToken) throw new Error("Please sign in again.");
        const result = await listInterstateDestinations(accessToken, next.city);
        setDestinations(result.destinations);
        // Straight into the second half of the question they are answering.
        if (result.destinations.length > 0) setPicker("to");
      } catch (loadError) {
        setError(
          toUserMessage(loadError, `We could not load destinations from ${next.city}.`),
        );
      }
    },
    [getAccessToken],
  );

  /* ── what it costs ─────────────────────────────────────────────────────── */

  const loadVehicles = useCallback(
    async (routeId: string, seatCount: number) => {
      setIsPricing(true);
      setError(null);
      try {
        const accessToken = await getAccessTokenWithRetry(getAccessToken);
        if (!accessToken) throw new Error("Please sign in again.");
        const result = await listInterstateVehicles(accessToken, {
          routeId,
          seats: seatCount,
        });
        setRoute(result.route);
        setRatePerKmNgn(result.ratePerKmNgn);
        setVehicles(result.vehicles);
        setVehicleType((current) => current ?? result.vehicles[0]?.type ?? null);
      } catch (loadError) {
        setError(toUserMessage(loadError, "We could not price that route."));
      } finally {
        setIsPricing(false);
      }
    },
    [getAccessToken],
  );

  // Prices depend on the route and on how many seats are wanted, so they are
  // re-fetched whenever either changes rather than left quietly stale.
  useEffect(() => {
    if (!destination) return;
    void loadVehicles(destination.routeId, seats);
  }, [destination, seats, loadVehicles]);

  const selectedVehicle = useMemo(
    () => vehicles.find((entry) => entry.type === vehicleType) ?? null,
    [vehicles, vehicleType],
  );

  const listPriceNgn = selectedVehicle
    ? mode === "alone"
      ? selectedVehicle.alonePriceNgn
      : selectedVehicle.togetherPriceNgn
    : 0;
  const floorNgn = minimumOfferNgn(listPriceNgn);
  const currentBid = bidNgn ?? listPriceNgn;
  const isBid = isBidBelowFare(currentBid, listPriceNgn);

  // Changing anything that moves the price re-anchors the bid, so a rider never
  // carries a sedan's number over onto a coach.
  useEffect(() => {
    setBidNgn(null);
  }, [vehicleType, mode, seats]);

  const adjustBid = useCallback(
    (delta: number) => {
      void Haptics.selectionAsync();
      setBidNgn((current) => Math.max(floorNgn, (current ?? listPriceNgn) + delta));
    },
    [floorNgn, listPriceNgn],
  );

  /* ── send it ───────────────────────────────────────────────────────────── */

  const submit = useCallback(async () => {
    if (!destination || !selectedVehicle) return;

    setIsSubmitting(true);
    try {
      const accessToken = await getAccessTokenWithRetry(getAccessToken);
      if (!accessToken) throw new Error("Please sign in again.");

      const result = await createTravelRequest(accessToken, {
        routeId: destination.routeId,
        departureAt: departureAt.toISOString(),
        vehicleType: selectedVehicle.type,
        mode,
        seats: mode === "alone" ? selectedVehicle.seats : seats,
        offeredNgn: currentBid,
        idempotencyKey: createIdempotencyKey("interstate-request"),
      });

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      Alert.alert(
        result.pendingOffer ? "Your request is with drivers" : "You are booked",
        result.pendingOffer
          ? `You offered ${formatNaira(currentBid)} for ${
              mode === "alone" ? "the whole vehicle" : `${seats} ${seats === 1 ? "seat" : "seats"}`
            }. Nothing has been charged — we only take the money if a driver accepts.`
          : `Reference ${result.booking.reference}. Show it at the terminal.`,
        [{ text: "See my trips", onPress: onSubmitted }],
      );
    } catch (submitError) {
      Alert.alert(
        "Could not send your request",
        toUserMessage(submitError, "Please try again. Nothing has been charged."),
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [
    currentBid,
    departureAt,
    destination,
    getAccessToken,
    mode,
    onSubmitted,
    seats,
    selectedVehicle,
  ]);

  const canSubmit = Boolean(origin && destination && selectedVehicle && !isSubmitting);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {error ? (
        <Animated.View entering={FadeIn} style={styles.errorCard}>
          <OnLight>
          <MaterialIcons name="error-outline" size={18} color={theme.colors.danger} />
          <AppText variant="bodySmall" color={theme.colors.danger} style={styles.flex}>
            {error}
          </AppText>
          <Pressable accessibilityRole="button" onPress={() => void loadOrigins()}>
            <AppText variant="bodySmall" color={theme.colors.black}>
              Retry
            </AppText>
          </Pressable>
          </OnLight>
        </Animated.View>
      ) : null}

      {/* From → To, the way a journey is actually described */}
      <View style={styles.routeCard}>
        <OnLight>
        <View style={styles.railColumn}>
          <View style={styles.railDot} />
          <View style={styles.railLine} />
          <View style={[styles.railDot, styles.railDotEnd]} />
        </View>

        <View style={styles.routeFields}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose where you are travelling from"
            onPress={() => setPicker("from")}
            style={styles.routeField}
          >
            <AppText variant="monoSmall" color={theme.colors.muted}>
              FROM
            </AppText>
            <AppText
              variant="bodyMedium"
              color={origin ? theme.colors.black : theme.colors.mutedLight}
              numberOfLines={1}
            >
              {origin ? `${origin.city}, ${origin.state}` : "Which city are you leaving?"}
            </AppText>
          </Pressable>

          <View style={styles.fieldDivider} />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose where you are travelling to"
            disabled={!origin}
            onPress={() => setPicker("to")}
            style={[styles.routeField, !origin ? styles.fieldDisabled : null]}
          >
            <AppText variant="monoSmall" color={theme.colors.muted}>
              TO
            </AppText>
            <AppText
              variant="bodyMedium"
              color={destination ? theme.colors.black : theme.colors.mutedLight}
              numberOfLines={1}
            >
              {destination
                ? `${destination.city}, ${destination.state}`
                : origin
                  ? "Where are you going?"
                  : "Pick where you are leaving first"}
            </AppText>
          </Pressable>
        </View>
        </OnLight>
      </View>

      {/* The rate, shown the moment there is a route to apply it to */}
      {route && ratePerKmNgn ? (
        <Animated.View entering={FadeIn.duration(220)} style={styles.rateCard}>
          <OnLight>
          <MaterialIcons name="straighten" size={16} color={theme.colors.orange} />
          <AppText variant="bodySmall" color={theme.colors.muted} style={styles.flex}>
            {Math.round(route.distanceKm)} km ·{" "}
            {formatTravelDuration(route.durationMinutes)} · priced at{" "}
            {formatNaira(ratePerKmNgn)} per km
          </AppText>
          </OnLight>
        </Animated.View>
      ) : null}

      {destination ? (
        <>
          <Section title="When are you travelling?">
            <DepartureField value={departureAt} onChange={setDepartureAt} />
          </Section>

          <Section title="Who is going?">
            <View style={styles.modeRow}>
              <ModeCard
                icon="person"
                title="Just me"
                body="A whole car to yourself. You bid for the vehicle."
                active={mode === "alone"}
                onPress={() => {
                  void Haptics.selectionAsync();
                  setMode("alone");
                }}
              />
              <ModeCard
                icon="groups"
                title="Share the ride"
                body="Travel with others. You bid for your seat."
                active={mode === "together"}
                onPress={() => {
                  void Haptics.selectionAsync();
                  setMode("together");
                }}
              />
            </View>

            {mode === "together" ? (
              <View style={styles.stepperRow}>
                <StepButton
                  icon="remove"
                  label="One fewer seat"
                  disabled={seats <= 1}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    setSeats((current) => Math.max(1, current - 1));
                  }}
                />
                <View style={styles.stepperCentre}>
                  <AppText variant="metric">{seats}</AppText>
                  <AppText variant="bodySmall" color={theme.colors.muted}>
                    {seats === 1 ? "seat" : "seats"}
                  </AppText>
                </View>
                <StepButton
                  icon="add"
                  label="One more seat"
                  disabled={seats >= (selectedVehicle?.seats ?? 10)}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    setSeats((current) =>
                      Math.min(selectedVehicle?.seats ?? 10, current + 1),
                    );
                  }}
                />
              </View>
            ) : null}
          </Section>

          <Section title="Pick your car">
            {isPricing && vehicles.length === 0 ? (
              <View style={styles.loading}>
                <ActivityIndicator color={theme.colors.orange} />
                <AppText variant="bodySmall" color={theme.colors.muted}>
                  Pricing this route…
                </AppText>
              </View>
            ) : (
              vehicles.map((vehicle, index) => (
                <Animated.View
                  key={vehicle.type}
                  entering={FadeInDown.delay(Math.min(index, 4) * 50).duration(240)}
                  layout={Layout.springify().damping(20)}
                >
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ selected: vehicleType === vehicle.type }}
                    onPress={() => {
                      void Haptics.selectionAsync();
                      setVehicleType(vehicle.type);
                    }}
                    style={[
                      styles.vehicleCard,
                      vehicleType === vehicle.type ? styles.vehicleCardActive : null,
                    ]}
                  >
                    <OnLight>
                    <View style={styles.vehicleIcon}>
                      <OnLight>
                      <MaterialIcons
                        name={
                          vehicle.type === "BUS"
                            ? "directions-bus"
                            : vehicle.type === "MINIBUS"
                              ? "airport-shuttle"
                              : vehicle.type === "SUV"
                                ? "directions-car-filled"
                                : "directions-car"
                        }
                        size={24}
                        color={theme.colors.black}
                      />
                      </OnLight>
                    </View>

                    <View style={styles.vehicleCopy}>
                      <AppText variant="bodyMedium">{vehicle.label}</AppText>
                      <AppText variant="bodySmall" color={theme.colors.muted}>
                        {vehicle.description}
                      </AppText>
                      <AppText variant="bodySmall" color={theme.colors.muted}>
                        {vehicle.seats} seats
                      </AppText>
                    </View>

                    <View style={styles.vehiclePrice}>
                      <AppText variant="monoLarge">
                        {formatNaira(
                          mode === "alone"
                            ? vehicle.alonePriceNgn
                            : vehicle.togetherPriceNgn,
                        )}
                      </AppText>
                      <AppText variant="bodySmall" color={theme.colors.muted}>
                        {mode === "alone"
                          ? "whole car"
                          : seats === 1
                            ? "per seat"
                            : `${seats} seats`}
                      </AppText>
                    </View>
                    </OnLight>
                  </Pressable>
                </Animated.View>
              ))
            )}
          </Section>

          {selectedVehicle ? (
            <Section title="Name your price">
              <View style={styles.bidCard}>
                <OnLight>
                <View style={styles.bidHead}>
                  <View style={styles.flex}>
                    <AppText variant="monoSmall" color={theme.colors.orange}>
                      YOUR BID
                    </AppText>
                    <AppText variant="metric">{formatNaira(currentBid)}</AppText>
                  </View>
                  <View style={styles.listPrice}>
                    <AppText variant="bodySmall" color={theme.colors.muted}>
                      Our price
                    </AppText>
                    <AppText variant="monoLarge" color={theme.colors.muted}>
                      {formatNaira(listPriceNgn)}
                    </AppText>
                  </View>
                </View>

                <View style={styles.stepperRow}>
                  <StepButton
                    icon="remove"
                    label="Lower your bid"
                    disabled={currentBid <= floorNgn}
                    onPress={() => adjustBid(-BID_STEP_NGN)}
                  />
                  <View style={styles.stepperCentre}>
                    <AppText
                      variant="bodySmall"
                      color={theme.colors.muted}
                      style={styles.center}
                    >
                      {currentBid === listPriceNgn
                        ? "Our price exactly"
                        : isBid
                          ? `${formatNaira(listPriceNgn - currentBid)} below our price`
                          : `${formatNaira(currentBid - listPriceNgn)} above our price`}
                    </AppText>
                  </View>
                  <StepButton
                    icon="add"
                    label="Raise your bid"
                    onPress={() => adjustBid(BID_STEP_NGN)}
                  />
                </View>

                {currentBid <= floorNgn ? (
                  <AppText variant="bodySmall" color={theme.colors.muted}>
                    {formatNaira(floorNgn)} is the lowest drivers will see on this
                    trip.
                  </AppText>
                ) : null}
                </OnLight>
              </View>

              <View
                style={[
                  styles.outcome,
                  isBid ? styles.outcomeBid : styles.outcomeInstant,
                ]}
              >
                <MaterialIcons
                  name={isBid ? "gavel" : "check-circle"}
                  size={18}
                  color={isBid ? theme.colors.black : theme.colors.green}
                />
                <AppText variant="bodySmall" style={styles.flex}>
                  {isBid
                    ? "Drivers see your bid and can take it. Nothing is charged unless one does."
                    : "Paying our price books this straight away from your wallet."}
                </AppText>
              </View>
            </Section>
          ) : null}

          <AppButton
            title={
              isSubmitting
                ? "Sending…"
                : isBid
                  ? `Send bid of ${formatNaira(currentBid)}`
                  : `Book for ${formatNaira(currentBid)}`
            }
            disabled={!canSubmit}
            onPress={() => void submit()}
          />
        </>
      ) : null}

      <CityPicker
        visible={picker !== null}
        title={picker === "from" ? "Travelling from" : "Travelling to"}
        loading={picker === "from" && isLoadingCities}
        rows={
          picker === "from"
            ? origins.map((city) => ({
                key: city.city,
                title: city.city,
                subtitle: city.state,
                onPress: () => void chooseOrigin(city),
              }))
            : destinations.map((city) => ({
                key: city.routeId,
                title: city.city,
                subtitle: `${city.state} · ${Math.round(city.distanceKm)} km`,
                onPress: () => {
                  void Haptics.selectionAsync();
                  setDestination(city);
                  setPicker(null);
                },
              }))
        }
        emptyTitle={
          picker === "from" ? "No routes available" : `Nothing from ${origin?.city ?? ""} yet`
        }
        emptyBody={
          picker === "from"
            ? "We are not running interstate trips right now. Please check back soon."
            : "We have not opened routes out of this city. Try another starting point."
        }
        onClose={() => setPicker(null)}
      />
    </ScrollView>
  );
}

/* ── pieces ──────────────────────────────────────────────────────────────── */

/**
 * When to travel.
 *
 * Deliberately a set of relative choices rather than a spinning date wheel:
 * almost every interstate journey is booked for tomorrow morning or the day
 * after, and picking "Tomorrow · 7:00 AM" is two taps where a date picker is
 * six.
 */
function DepartureField({
  value,
  onChange,
}: {
  value: Date;
  onChange: (next: Date) => void;
}) {
  const days = useMemo(() => {
    const today = new Date();
    return Array.from({ length: Math.min(7, MAX_DAYS_AHEAD) }, (_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() + index);
      date.setHours(value.getHours(), value.getMinutes(), 0, 0);
      return date;
    });
  }, [value]);

  const hours = [5, 6, 7, 8, 9, 10, 12, 14, 16, 18];

  return (
    <View style={styles.whenBlock}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        {days.map((day, index) => {
          const active = day.toDateString() === value.toDateString();
          return (
            <Pressable
              key={day.toDateString()}
              accessibilityRole="button"
              onPress={() => {
                void Haptics.selectionAsync();
                onChange(day);
              }}
              style={[styles.dayChip, active ? styles.chipActive : null]}
            >
              <OnLight>
              <AppText variant="bodyMedium">
                {index === 0
                  ? "Today"
                  : index === 1
                    ? "Tomorrow"
                    : day.toLocaleDateString("en-NG", { weekday: "short" })}
              </AppText>
              <AppText variant="bodySmall" color={theme.colors.muted}>
                {day.toLocaleDateString("en-NG", { day: "numeric", month: "short" })}
              </AppText>
              </OnLight>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        {hours.map((hour) => {
          const active = value.getHours() === hour;
          const label = new Date(2000, 0, 1, hour).toLocaleTimeString("en-NG", {
            hour: "numeric",
            hour12: true,
          });
          return (
            <Pressable
              key={hour}
              accessibilityRole="button"
              onPress={() => {
                void Haptics.selectionAsync();
                const next = new Date(value);
                next.setHours(hour, 0, 0, 0);
                onChange(next);
              }}
              style={[styles.timeChip, active ? styles.chipActive : null]}
            >
              <OnLight>
              <AppText variant="bodySmall">{label}</AppText>
              </OnLight>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function CityPicker({
  visible,
  title,
  rows,
  loading,
  emptyTitle,
  emptyBody,
  onClose,
}: {
  visible: boolean;
  title: string;
  rows: { key: string; title: string; subtitle: string; onPress: () => void }[];
  loading?: boolean;
  emptyTitle: string;
  emptyBody: string;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (visible) setQuery("");
  }, [visible]);

  const filtered = rows.filter((row) =>
    `${row.title} ${row.subtitle}`.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.pickerSheet}>
        <OnLight>
        <View style={styles.pickerHead}>
          <AppText variant="h2" style={styles.flex}>
            {title}
          </AppText>
          <Pressable accessibilityRole="button" onPress={onClose} style={styles.closeButton}>
            <OnLight>
            <MaterialIcons name="close" size={22} color={theme.colors.black} />
            </OnLight>
          </Pressable>
        </View>

        <View style={styles.searchField}>
          <OnLight>
          <MaterialIcons name="search" size={20} color={theme.colors.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search cities"
            placeholderTextColor={theme.colors.mutedLight}
            style={styles.searchInput}
            selectionColor={theme.colors.orange}
            autoFocus={Platform.OS === "ios"}
          />
          </OnLight>
        </View>

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={theme.colors.orange} />
            <AppText variant="bodySmall" color={theme.colors.muted}>
              Loading cities…
            </AppText>
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.empty}>
            <MaterialIcons name="location-off" size={30} color={theme.colors.mutedLight} />
            <AppText variant="bodyMedium">
              {rows.length === 0 ? emptyTitle : "No city matches that"}
            </AppText>
            <AppText variant="bodySmall" color={theme.colors.muted} style={styles.center}>
              {rows.length === 0 ? emptyBody : "Try a different spelling."}
            </AppText>
          </View>
        ) : (
          <ScrollView keyboardShouldPersistTaps="handled">
            {filtered.map((row) => (
              <Pressable
                key={row.key}
                accessibilityRole="button"
                onPress={row.onPress}
                style={styles.cityRow}
              >
                <MaterialIcons name="place" size={20} color={theme.colors.orange} />
                <View style={styles.flex}>
                  <AppText variant="bodyMedium">{row.title}</AppText>
                  <AppText variant="bodySmall" color={theme.colors.muted}>
                    {row.subtitle}
                  </AppText>
                </View>
                <MaterialIcons
                  name="chevron-right"
                  size={22}
                  color={theme.colors.mutedLight}
                />
              </Pressable>
            ))}
          </ScrollView>
        )}
        </OnLight>
      </View>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <AppText variant="h3">{title}</AppText>
      {children}
    </View>
  );
}

function ModeCard({
  icon,
  title,
  body,
  active,
  onPress,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  body: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.modeCard, active ? styles.modeCardActive : null]}
    >
      <OnLight>
      <MaterialIcons
        name={icon}
        size={22}
        color={active ? theme.colors.black : theme.colors.muted}
      />
      <AppText variant="bodyMedium">{title}</AppText>
      <AppText variant="bodySmall" color={theme.colors.muted}>
        {body}
      </AppText>
      </OnLight>
    </Pressable>
  );
}

function StepButton({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: "add" | "remove";
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.stepButton,
        icon === "add" ? styles.stepButtonUp : null,
        disabled ? styles.disabled : null,
      ]}
    >
      <OnLight>
      <MaterialIcons name={icon} size={20} color={theme.colors.black} />
      </OnLight>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: theme.spacing.gutter,
    paddingBottom: theme.spacing.xxxl,
    gap: theme.spacing.lg,
  },
  flex: { flex: 1 },
  center: { textAlign: "center" },
  errorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dangerLight,
  },
  routeCard: {
    flexDirection: "row",
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.white,
    ...theme.shadows.card,
  },
  railColumn: { alignItems: "center", paddingTop: 6 },
  railDot: {
    width: 10,
    height: 10,
    borderRadius: theme.radius.pill,
    borderWidth: 2,
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.orange,
  },
  railDotEnd: { backgroundColor: theme.colors.green, borderRadius: 2 },
  railLine: {
    flex: 1,
    width: 2,
    marginVertical: 4,
    backgroundColor: theme.colors.borderLight,
  },
  routeFields: { flex: 1 },
  routeField: { gap: 2, paddingVertical: theme.spacing.sm },
  fieldDisabled: { opacity: 0.55 },
  fieldDivider: {
    height: 1,
    backgroundColor: theme.colors.borderLight,
    marginVertical: theme.spacing.xs,
  },
  rateCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.orangeLight,
  },
  section: { gap: theme.spacing.md },
  whenBlock: { gap: theme.spacing.sm },
  chipRow: { gap: theme.spacing.sm, paddingRight: theme.spacing.gutter },
  dayChip: {
    minWidth: 84,
    gap: 1,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.white,
  },
  timeChip: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.pill,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.white,
  },
  chipActive: {
    borderColor: theme.colors.borderLight,
    borderWidth: theme.borders.thick,
    backgroundColor: theme.colors.orangeLight,
  },
  modeRow: { flexDirection: "row", gap: theme.spacing.sm },
  modeCard: {
    flex: 1,
    gap: theme.spacing.xs,
    padding: theme.spacing.lg,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.white,
  },
  modeCardActive: {
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.orangeLight,
    ...theme.shadows.subtle,
  },
  vehicleCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.white,
  },
  vehicleCardActive: {
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.orangeLight,
    ...theme.shadows.subtle,
  },
  vehicleIcon: {
    width: 46,
    height: 46,
    borderRadius: theme.radius.sm,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.offWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  vehicleCopy: { flex: 1, gap: 1 },
  vehiclePrice: { alignItems: "flex-end" },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
  },
  stepperCentre: { flex: 1, alignItems: "center", gap: 1 },
  stepButton: {
    width: 52,
    height: 52,
    borderRadius: theme.radius.sm,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.offWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  stepButtonUp: { backgroundColor: theme.colors.orangeLight },
  disabled: { opacity: 0.4 },
  bidCard: {
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.white,
    ...theme.shadows.card,
  },
  bidHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing.md,
  },
  listPrice: { alignItems: "flex-end" },
  outcome: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radius.sm,
  },
  outcomeBid: { backgroundColor: theme.colors.orangeLight },
  outcomeInstant: { backgroundColor: theme.colors.successLight },
  loading: {
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xxl,
  },
  empty: {
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xxxl,
    paddingHorizontal: theme.spacing.gutter,
  },
  pickerSheet: {
    flex: 1,
    paddingTop: theme.spacing.xxxl,
    paddingHorizontal: theme.spacing.gutter,
    backgroundColor: theme.colors.offWhite,
  },
  pickerHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.md,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.pill,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.white,
  },
  searchField: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    height: 48,
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.md,
    borderRadius: theme.radius.sm,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.white,
  },
  searchInput: {
    flex: 1,
    fontFamily: theme.fonts.body,
    fontSize: 14,
    color: theme.colors.black,
  },
  cityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
});
