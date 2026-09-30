import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import Animated, { FadeIn, FadeInDown, Layout } from "react-native-reanimated";

import { AppButton } from "@/components/app-button";
import { AppCard } from "@/components/app-card";
import { AppScreen } from "@/components/app-screen";
import { AppText } from "@/components/app-text";
import { EmergencyButton } from "@/components/emergency-button";
import { getAccessTokenWithRetry } from "@/lib/access-token";
import { useAuth } from "@/lib/auth";
import { toUserMessage } from "@/lib/error-messages";
import {
  acceptInterstateOffer,
  claimDeparture,
  completeDeparture,
  describeDepartureStatus,
  formatDepartureTime,
  formatNaira,
  formatTravelDuration,
  getDepartureManifest,
  declineInterstateOffer,
  listClaimableDepartures,
  listInterstateOffers,
  listMyInterstateTrips,
  routeLabel,
  startDeparture,
  type DriverDeparture,
  type InterstateOffer,
  type InterstatePassenger,
} from "@/lib/interstate";
import { theme } from "@/theme";
import { emitKycRequired, knownDriverKyc } from "@/lib/driver-kyc";

type Tab = "available" | "offers" | "mine";

/**
 * Interstate travel, from the driver's side.
 *
 * A city driver is matched to one passenger at a time. An interstate driver
 * takes a whole departure — a vehicle, a time, and a list of people who have
 * already paid — and runs it to another state. So the screen answers exactly
 * three questions, in the order a driver asks them: what can I take, what am I
 * running, and who is on board.
 */
export default function DriverInterstateScreen() {
  const { getAccessToken } = useAuth();
  const [tab, setTab] = useState<Tab>("available");
  const [available, setAvailable] = useState<DriverDeparture[]>([]);
  const [mine, setMine] = useState<DriverDeparture[]>([]);
  const [offers, setOffers] = useState<InterstateOffer[]>([]);
  const [manifests, setManifests] = useState<Record<string, InterstatePassenger[]>>(
    {},
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const accessToken = await getAccessTokenWithRetry(getAccessToken);
      if (!accessToken) throw new Error("Please sign in again.");

      const [claimable, running, pending] = await Promise.all([
        listClaimableDepartures(accessToken),
        listMyInterstateTrips(accessToken),
        listInterstateOffers(accessToken),
      ]);

      setAvailable(claimable.departures);
      setMine(running.departures);
      setOffers(pending.offers);
    } catch (loadError) {
      setError(toUserMessage(loadError, "We could not load interstate trips."));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const claim = useCallback(
    (departure: DriverDeparture) => {
      Alert.alert(
        "Take this trip?",
        `${routeLabel(departure.route)}, leaving ${formatDepartureTime(
          departure.departureAt,
        )}.\n\n${departure.seatsBooked} ${
          departure.seatsBooked === 1 ? "passenger has" : "passengers have"
        } already paid. Once you take it, they are expecting you.`,
        [
          { text: "Not this one", style: "cancel" },
          {
            text: "Take it",
            onPress: () => {
              void (async () => {
                // Approved drivers only, on the phone as on the server.
                if (knownDriverKyc() !== "APPROVED") {
                  emitKycRequired();
                  return;
                }
                setBusyId(departure.id);
                try {
                  const accessToken = await getAccessTokenWithRetry(getAccessToken);
                  if (!accessToken) throw new Error("Please sign in again.");
                  await claimDeparture(accessToken, departure.id);
                  void Haptics.notificationAsync(
                    Haptics.NotificationFeedbackType.Success,
                  );
                  setTab("mine");
                  await load();
                } catch (claimError) {
                  Alert.alert(
                    "Could not take this trip",
                    toUserMessage(
                      claimError,
                      "Another driver may have taken it. Pull down to refresh.",
                    ),
                  );
                  await load();
                } finally {
                  setBusyId(null);
                }
              })();
            },
          },
        ],
      );
    },
    [getAccessToken, load],
  );

  const advance = useCallback(
    (departure: DriverDeparture, to: "IN_TRANSIT" | "COMPLETED") => {
      const isStart = to === "IN_TRANSIT";

      Alert.alert(
        isStart ? "Start this trip?" : "Finish this trip?",
        isStart
          ? "Only start once everyone on your list is on board."
          : "This marks every passenger as arrived and closes the trip.",
        [
          { text: "Not yet", style: "cancel" },
          {
            text: isStart ? "Start trip" : "Finish trip",
            onPress: () => {
              void (async () => {
                setBusyId(departure.id);
                try {
                  const accessToken = await getAccessTokenWithRetry(getAccessToken);
                  if (!accessToken) throw new Error("Please sign in again.");

                  if (isStart) {
                    await startDeparture(accessToken, departure.id);
                  } else {
                    await completeDeparture(accessToken, departure.id);
                  }

                  void Haptics.notificationAsync(
                    Haptics.NotificationFeedbackType.Success,
                  );
                  await load();
                } catch (advanceError) {
                  Alert.alert(
                    isStart ? "Could not start" : "Could not finish",
                    toUserMessage(advanceError, "Please try again in a moment."),
                  );
                } finally {
                  setBusyId(null);
                }
              })();
            },
          },
        ],
      );
    },
    [getAccessToken, load],
  );

  /**
   * Take a passenger's price. This is the moment their wallet is charged and
   * their seat is allocated — up to now the bid held nothing — so the amount
   * and the trip are both spelled out before confirming.
   */
  const respondToOffer = useCallback(
    (offer: InterstateOffer, accept: boolean) => {
      const shortfall = offer.listPriceNgn - offer.offeredNgn;

      Alert.alert(
        accept ? "Accept this price?" : "Turn down this offer?",
        accept
          ? `${offer.passenger.name} offered ${formatNaira(offer.offeredNgn)} for ${
              offer.seats
            } ${offer.seats === 1 ? "seat" : "seats"} — ${formatNaira(
              shortfall,
            )} below the posted fare of ${formatNaira(offer.listPriceNgn)}.\n\n${routeLabel(
              offer.departure.route,
            )}, leaving ${formatDepartureTime(offer.departure.departureAt)}.`
          : "They will be told nobody took this price and can offer again.",
        [
          { text: "Back", style: "cancel" },
          {
            text: accept ? "Accept" : "Turn down",
            style: accept ? "default" : "destructive",
            onPress: () => {
              void (async () => {
                setBusyId(offer.bookingId);
                try {
                  const accessToken = await getAccessTokenWithRetry(getAccessToken);
                  if (!accessToken) throw new Error("Please sign in again.");

                  if (accept) {
                    await acceptInterstateOffer(accessToken, offer.bookingId);
                    void Haptics.notificationAsync(
                      Haptics.NotificationFeedbackType.Success,
                    );
                  } else {
                    await declineInterstateOffer(accessToken, offer.bookingId);
                  }

                  await load();
                } catch (offerError) {
                  Alert.alert(
                    accept ? "Could not accept" : "Could not decline",
                    toUserMessage(
                      offerError,
                      "That offer may have already been taken. Pull down to refresh.",
                    ),
                  );
                  await load();
                } finally {
                  setBusyId(null);
                }
              })();
            },
          },
        ],
      );
    },
    [getAccessToken, load],
  );

  const toggleManifest = useCallback(
    async (departure: DriverDeparture) => {
      void Haptics.selectionAsync();

      if (expandedId === departure.id) {
        setExpandedId(null);
        return;
      }

      setExpandedId(departure.id);
      if (manifests[departure.id]) return;

      try {
        const accessToken = await getAccessTokenWithRetry(getAccessToken);
        if (!accessToken) throw new Error("Please sign in again.");
        const result = await getDepartureManifest(accessToken, departure.id);
        setManifests((current) => ({
          ...current,
          [departure.id]: result.passengers,
        }));
      } catch (manifestError) {
        Alert.alert(
          "Could not load passengers",
          toUserMessage(manifestError, "Please try again in a moment."),
        );
        setExpandedId(null);
      }
    },
    [expandedId, getAccessToken, manifests],
  );

  const rows = tab === "available" ? available : tab === "mine" ? mine : [];
  const runningTrip = mine.find((trip) => trip.status === "IN_TRANSIT");

  return (
    <AppScreen
      backgroundColor={theme.colors.offWhite}
      contentStyle={styles.container}
      safeAreaEdges={["top", "left", "right"]}
    >
      <StatusBar style="dark" />

      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <AppText variant="monoSmall" color={theme.colors.orange}>
            INTERSTATE
          </AppText>
          <AppText variant="h1">Long-distance trips</AppText>
        </View>
        {/* A driver on the road between states is the person furthest from
            help, so the button travels with the feature. */}
        {runningTrip ? (
          <EmergencyButton
            role="DRIVER"
            interstateDepartureId={runningTrip.id}
            compact
          />
        ) : null}
      </View>

      <View style={styles.tabRow}>
        <TabButton
          label={`Available${available.length ? ` (${available.length})` : ""}`}
          active={tab === "available"}
          onPress={() => setTab("available")}
        />
        <TabButton
          label={`Offers${offers.length ? ` (${offers.length})` : ""}`}
          active={tab === "offers"}
          onPress={() => setTab("offers")}
        />
        <TabButton
          label={`My trips${mine.length ? ` (${mine.length})` : ""}`}
          active={tab === "mine"}
          onPress={() => setTab("mine")}
        />
      </View>

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={theme.colors.orange} />
          <AppText variant="bodySmall" color={theme.colors.muted}>
            Loading trips…
          </AppText>
        </View>
      ) : (
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
            <Animated.View entering={FadeIn} style={styles.errorCard}>
              <MaterialIcons
                name="error-outline"
                size={18}
                color={theme.colors.danger}
              />
              <AppText
                variant="bodySmall"
                color={theme.colors.danger}
                style={styles.flex}
              >
                {error}
              </AppText>
              <Pressable accessibilityRole="button" onPress={() => void load()}>
                <AppText variant="bodySmall" color={theme.colors.black}>
                  Retry
                </AppText>
              </Pressable>
            </Animated.View>
          ) : null}

          {tab === "offers" ? (
            offers.length === 0 ? (
              <View style={styles.empty}>
                <MaterialIcons
                  name="gavel"
                  size={30}
                  color={theme.colors.mutedLight}
                />
                <AppText variant="bodyMedium">No passenger offers</AppText>
                <AppText
                  variant="bodySmall"
                  color={theme.colors.muted}
                  style={styles.center}
                >
                  When a passenger offers below the posted fare, their price
                  lands here for you to take or turn down.
                </AppText>
              </View>
            ) : (
              offers.map((offer, index) => (
                <Animated.View
                  key={offer.bookingId}
                  entering={FadeInDown.delay(Math.min(index, 6) * 60).duration(280)}
                  layout={Layout.springify().damping(20)}
                >
                  <AppCard style={styles.card}>
                    <View style={styles.cardHead}>
                      <View style={styles.flex}>
                        <AppText variant="h3">
                          {routeLabel(offer.departure.route)}
                        </AppText>
                        <AppText variant="bodySmall" color={theme.colors.muted}>
                          {formatDepartureTime(offer.departure.departureAt)}
                        </AppText>
                      </View>
                      <View style={styles.earnBlock}>
                        <AppText variant="monoLarge">
                          {formatNaira(offer.offeredNgn)}
                        </AppText>
                        {/* The posted fare struck through, so the gap the
                            driver is being asked to accept is visible rather
                            than something they have to work out. */}
                        <AppText variant="bodySmall" color={theme.colors.muted}>
                          fare {formatNaira(offer.listPriceNgn)}
                        </AppText>
                      </View>
                    </View>

                    <View style={styles.metaRow}>
                      <Meta
                        icon="person"
                        label={offer.passenger.name}
                      />
                      <Meta
                        icon="airline-seat-recline-normal"
                        label={`${offer.seats} ${offer.seats === 1 ? "seat" : "seats"}`}
                      />
                      <Meta
                        icon="trending-down"
                        label={`${formatNaira(
                          offer.listPriceNgn - offer.offeredNgn,
                        )} under`}
                      />
                    </View>

                    {offer.pickupNote ? (
                      <View style={styles.terminalRow}>
                        <MaterialIcons
                          name="sticky-note-2"
                          size={14}
                          color={theme.colors.orange}
                        />
                        <AppText
                          variant="bodySmall"
                          color={theme.colors.muted}
                          style={styles.flex}
                        >
                          {offer.pickupNote}
                        </AppText>
                      </View>
                    ) : null}

                    <View style={styles.offerActions}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Turn down ${offer.passenger.name}`}
                        disabled={busyId !== null}
                        onPress={() => respondToOffer(offer, false)}
                        style={[styles.declineButton, busyId !== null && styles.disabled]}
                      >
                        <AppText variant="bodySmall">Turn down</AppText>
                      </Pressable>

                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Accept ${formatNaira(offer.offeredNgn)}`}
                        disabled={busyId !== null}
                        onPress={() => respondToOffer(offer, true)}
                        style={[styles.acceptButton, busyId !== null && styles.disabled]}
                      >
                        <AppText variant="bodySmall" color={theme.colors.offWhite}>
                          {busyId === offer.bookingId
                            ? "Working…"
                            : `Accept ${formatNaira(offer.offeredNgn)}`}
                        </AppText>
                      </Pressable>
                    </View>
                  </AppCard>
                </Animated.View>
              ))
            )
          ) : null}

          {tab !== "offers" && rows.length === 0 && !error ? (
            <View style={styles.empty}>
              <MaterialIcons
                name={tab === "available" ? "explore-off" : "no-transfer"}
                size={30}
                color={theme.colors.mutedLight}
              />
              <AppText variant="bodyMedium">
                {tab === "available"
                  ? "No trips to take right now"
                  : "You are not running any interstate trips"}
              </AppText>
              <AppText
                variant="bodySmall"
                color={theme.colors.muted}
                style={styles.center}
              >
                {tab === "available"
                  ? "Trips appear here once passengers have booked seats on them. Pull down to check again."
                  : "Take one from the Available tab and it will show up here with your passenger list."}
              </AppText>
            </View>
          ) : null}

          {(tab === "offers" ? [] : rows).map((departure, index) => (
            <Animated.View
              key={departure.id}
              entering={FadeInDown.delay(Math.min(index, 6) * 60).duration(280)}
              layout={Layout.springify().damping(20)}
            >
              <AppCard style={styles.card}>
                <View style={styles.cardHead}>
                  <View style={styles.flex}>
                    <AppText variant="h3">{routeLabel(departure.route)}</AppText>
                    <AppText variant="bodySmall" color={theme.colors.muted}>
                      {formatDepartureTime(departure.departureAt)}
                    </AppText>
                  </View>
                  <View style={styles.earnBlock}>
                    <AppText variant="monoLarge">
                      {formatNaira(departure.grossNgn)}
                    </AppText>
                    <AppText variant="bodySmall" color={theme.colors.muted}>
                      {departure.seatsBooked}/{departure.totalSeats} seats sold
                    </AppText>
                  </View>
                </View>

                <View style={styles.metaRow}>
                  <Meta
                    icon="schedule"
                    label={formatTravelDuration(departure.route.durationMinutes)}
                  />
                  <Meta
                    icon="straighten"
                    label={`${Math.round(departure.route.distanceKm)} km`}
                  />
                  <Meta
                    icon="directions-bus"
                    label={describeDepartureStatus(departure.status)}
                  />
                </View>

                <View style={styles.terminalRow}>
                  <MaterialIcons name="place" size={14} color={theme.colors.orange} />
                  <AppText variant="bodySmall" color={theme.colors.muted} style={styles.flex}>
                    Pick up at {departure.route.origin.terminal}
                  </AppText>
                </View>

                {tab === "available" ? (
                  <AppButton
                    title={busyId === departure.id ? "Taking…" : "Take this trip"}
                    disabled={busyId !== null}
                    onPress={() => claim(departure)}
                  />
                ) : (
                  <>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => void toggleManifest(departure)}
                      style={styles.manifestToggle}
                    >
                      <MaterialIcons
                        name="people"
                        size={18}
                        color={theme.colors.black}
                      />
                      <AppText variant="bodyMedium" style={styles.flex}>
                        {departure.seatsBooked}{" "}
                        {departure.seatsBooked === 1 ? "passenger" : "passengers"}
                      </AppText>
                      <MaterialIcons
                        name={
                          expandedId === departure.id
                            ? "keyboard-arrow-up"
                            : "keyboard-arrow-down"
                        }
                        size={22}
                        color={theme.colors.muted}
                      />
                    </Pressable>

                    {expandedId === departure.id ? (
                      <Manifest passengers={manifests[departure.id]} />
                    ) : null}

                    {departure.status === "DISPATCHED" ? (
                      <AppButton
                        title={busyId === departure.id ? "Starting…" : "Start trip"}
                        disabled={busyId !== null}
                        onPress={() => advance(departure, "IN_TRANSIT")}
                      />
                    ) : departure.status === "IN_TRANSIT" ? (
                      <AppButton
                        title={busyId === departure.id ? "Finishing…" : "Finish trip"}
                        disabled={busyId !== null}
                        onPress={() => advance(departure, "COMPLETED")}
                      />
                    ) : (
                      <AppText variant="bodySmall" color={theme.colors.muted}>
                        {describeDepartureStatus(departure.status)}
                      </AppText>
                    )}
                  </>
                )}
              </AppCard>
            </Animated.View>
          ))}
        </ScrollView>
      )}
    </AppScreen>
  );
}

function Manifest({ passengers }: { passengers?: InterstatePassenger[] }) {
  if (!passengers) {
    return (
      <View style={styles.manifestLoading}>
        <ActivityIndicator color={theme.colors.orange} size="small" />
      </View>
    );
  }

  if (passengers.length === 0) {
    return (
      <AppText variant="bodySmall" color={theme.colors.muted}>
        Nobody has booked this trip yet.
      </AppText>
    );
  }

  return (
    <View style={styles.manifest}>
      {passengers.map((passenger) => (
        <View key={passenger.bookingId} style={styles.passengerRow}>
          <View style={styles.flex}>
            <AppText variant="bodyMedium">{passenger.name}</AppText>
            <AppText variant="bodySmall" color={theme.colors.muted}>
              {passenger.reference} · {passenger.seats}{" "}
              {passenger.seats === 1 ? "seat" : "seats"}
              {passenger.pickupNote ? ` · ${passenger.pickupNote}` : ""}
            </AppText>
          </View>

          {passenger.phone ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Call ${passenger.name}`}
              onPress={() => {
                void Linking.openURL(`tel:${passenger.phone}`).catch(() => {
                  Alert.alert(
                    "Could not open your dialler",
                    `Call ${passenger.phone} from your phone app.`,
                  );
                });
              }}
              style={styles.callButton}
            >
              <MaterialIcons name="call" size={18} color={theme.colors.black} />
            </Pressable>
          ) : null}
        </View>
      ))}
    </View>
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

function Meta({
  icon,
  label,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
}) {
  return (
    <View style={styles.meta}>
      <MaterialIcons name={icon} size={14} color={theme.colors.muted} />
      <AppText variant="bodySmall" color={theme.colors.muted}>
        {label}
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
    gap: theme.spacing.md,
  },
  card: { gap: theme.spacing.md },
  cardHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing.md,
  },
  earnBlock: { alignItems: "flex-end" },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.md },
  meta: { flexDirection: "row", alignItems: "center", gap: theme.spacing.xs },
  terminalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  manifestToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radius.sm,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.offWhite,
  },
  manifest: { gap: theme.spacing.sm },
  manifestLoading: { paddingVertical: theme.spacing.md, alignItems: "center" },
  passengerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.orangeLight,
  },
  callButton: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.pill,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  offerActions: { flexDirection: "row", gap: theme.spacing.sm },
  declineButton: {
    flex: 1,
    height: 46,
    borderRadius: theme.radius.sm,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  acceptButton: {
    flex: 2,
    height: 46,
    borderRadius: theme.radius.sm,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.black,
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: { opacity: 0.5 },
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
    paddingVertical: theme.spacing.xxxl,
  },
});
