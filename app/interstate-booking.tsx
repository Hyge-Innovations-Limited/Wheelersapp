import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";

import { AppButton } from "@/components/app-button";
import { AppScreen } from "@/components/app-screen";
import { AppText, OnLight } from "@/components/app-text";
import { BackArrow } from "@/components/back-arrow";
import { getAccessTokenWithRetry } from "@/lib/access-token";
import { useAuth } from "@/lib/auth";
import { toUserMessage } from "@/lib/error-messages";
import { createIdempotencyKey } from "@/lib/idempotency";
import {
  bookInterstateSeats,
  formatDepartureTime,
  formatNaira,
  formatTravelDuration,
  isBidBelowFare,
  minimumOfferNgn,
  type InterstateDeparture,
} from "@/lib/interstate";
import { theme } from "@/theme";

/** How much one tap moves the offer. */
const OFFER_STEP_NGN = 500;

/** The backend refuses more than this in one booking. */
const MAX_SEATS = 10;

type TravelMode = "together" | "alone";

/**
 * Booking a seat between cities.
 *
 * Deliberately the same shape as booking a city ride: pick how you want to
 * travel, then name your price. The two differences from a city ride are the
 * only two that matter here — you are buying seats on a vehicle that leaves at
 * a fixed time, and the fare has a posted price to bid against rather than an
 * estimate.
 *
 * Offering the posted price or more books outright. Offering less sends the
 * trip to drivers as a bid: nothing is charged and no seat is held until one of
 * them says yes, so a rider is never out of pocket for a price nobody accepted.
 */
export default function InterstateBookingScreen() {
  const router = useRouter();
  const { getAccessToken } = useAuth();
  const params = useLocalSearchParams<{ departure?: string | string[] }>();

  const departure = useMemo<InterstateDeparture | null>(() => {
    const raw = Array.isArray(params.departure) ? params.departure[0] : params.departure;
    if (!raw) return null;
    try {
      return JSON.parse(raw) as InterstateDeparture;
    } catch {
      return null;
    }
  }, [params.departure]);

  const [mode, setMode] = useState<TravelMode>("together");
  const [seats, setSeats] = useState(1);
  const [passengerName, setPassengerName] = useState("");
  const [passengerPhone, setPassengerPhone] = useState("");
  const [pickupNote, setPickupNote] = useState("");
  const [offerNgn, setOfferNgn] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Travelling alone means taking every remaining seat on the vehicle, so the
  // seat count stops being the rider's to choose.
  const effectiveSeats =
    mode === "alone" ? Math.min(departure?.seatsAvailable ?? 1, MAX_SEATS) : seats;

  const listPriceNgn = (departure?.seatPriceNgn ?? 0) * effectiveSeats;
  const floorNgn = minimumOfferNgn(listPriceNgn);
  const currentOffer = offerNgn ?? listPriceNgn;
  // Same rule the server applies, from the same module, so the copy on screen
  // can never promise an outcome the backend will not deliver.
  const isBid = isBidBelowFare(currentOffer, listPriceNgn);

  const adjustOffer = useCallback(
    (delta: number) => {
      void Haptics.selectionAsync();
      setOfferNgn((current) =>
        Math.max(floorNgn, (current ?? listPriceNgn) + delta),
      );
    },
    [floorNgn, listPriceNgn],
  );

  const submit = useCallback(async () => {
    if (!departure) return;

    setIsSubmitting(true);
    try {
      const accessToken = await getAccessTokenWithRetry(getAccessToken);
      if (!accessToken) throw new Error("Please sign in again to book.");

      const result = await bookInterstateSeats(accessToken, {
        departureId: departure.id,
        seats: effectiveSeats,
        offeredNgn: currentOffer,
        passengerName: passengerName.trim() || undefined,
        passengerPhone: passengerPhone.trim() || undefined,
        pickupNote: pickupNote.trim() || undefined,
        idempotencyKey: createIdempotencyKey("interstate-booking"),
      });

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      if (result.pendingOffer) {
        Alert.alert(
          "Offer sent to drivers",
          `You offered ${formatNaira(currentOffer)}${
            result.replacedPreviousOffer ? ", replacing your earlier offer" : ""
          }. Nothing has been charged — we will only take the money if a driver accepts.`,
          [{ text: "See my trips", onPress: () => router.replace("/rider/interstate") }],
        );
      } else {
        Alert.alert(
          "You are booked",
          `Reference ${result.booking.reference}. Show it at the terminal.`,
          [{ text: "See my trips", onPress: () => router.replace("/rider/interstate") }],
        );
      }
    } catch (error) {
      Alert.alert(
        "Could not complete this",
        toUserMessage(error, "Please try again. Nothing has been charged."),
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [
    currentOffer,
    departure,
    effectiveSeats,
    getAccessToken,
    passengerName,
    passengerPhone,
    pickupNote,
    router,
  ]);

  if (!departure) {
    return (
      <AppScreen backgroundColor={theme.colors.offWhite} contentStyle={styles.missing}>
        <MaterialIcons name="error-outline" size={30} color={theme.colors.muted} />
        <AppText variant="h3">That trip is no longer available</AppText>
        <AppText variant="bodySmall" color={theme.colors.muted} style={styles.center}>
          Go back and pick another departure.
        </AppText>
        <AppButton title="Back to travel" onPress={() => router.replace("/rider/interstate")} />
      </AppScreen>
    );
  }

  return (
    <AppScreen
      backgroundColor={theme.colors.offWhite}
      scroll
      contentStyle={styles.container}
      safeAreaEdges={["top", "left", "right"]}
    >
      <StatusBar style="dark" />

      <View style={styles.header}>
        <BackArrow onPress={() => router.back()} />
        <View style={styles.headerCopy}>
          <AppText variant="monoSmall" color={theme.colors.orange}>
            BOOK THIS TRIP
          </AppText>
          <AppText variant="h2">
            {departure.route.origin.city} → {departure.route.destination.city}
          </AppText>
        </View>
      </View>

      {/* The trip itself, stated once so nothing below is ambiguous */}
      <View style={styles.tripCard}>
        <OnLight>
        <Row
          icon="schedule"
          label="Leaves"
          value={formatDepartureTime(departure.departureAt)}
        />
        <Divider />
        <Row
          icon="place"
          label="From"
          value={departure.route.origin.terminal}
        />
        <Divider />
        <Row
          icon="flag"
          label="To"
          value={departure.route.destination.terminal}
        />
        <Divider />
        <Row
          icon="straighten"
          label="Journey"
          value={`${Math.round(departure.route.distanceKm)} km · ${formatTravelDuration(
            departure.route.durationMinutes,
          )}`}
        />
        </OnLight>
      </View>

      <Section title="How do you want to travel?">
        <View style={styles.modeRow}>
          <ModeCard
            icon="groups"
            title="Together"
            body="Share the vehicle with other passengers. Pay per seat."
            active={mode === "together"}
            onPress={() => {
              void Haptics.selectionAsync();
              setMode("together");
              setOfferNgn(null);
            }}
          />
          <ModeCard
            icon="person"
            title="Just me"
            body={`Take the remaining ${departure.seatsAvailable} ${
              departure.seatsAvailable === 1 ? "seat" : "seats"
            } so nobody else joins.`}
            active={mode === "alone"}
            onPress={() => {
              void Haptics.selectionAsync();
              setMode("alone");
              setOfferNgn(null);
            }}
          />
        </View>
      </Section>

      {mode === "together" ? (
        <Section title="How many seats?">
          <View style={styles.stepperRow}>
            <StepButton
              icon="remove"
              label="One fewer seat"
              disabled={seats <= 1}
              onPress={() => {
                void Haptics.selectionAsync();
                setSeats((current) => Math.max(1, current - 1));
                setOfferNgn(null);
              }}
            />
            <View style={styles.stepperCentre}>
              <AppText variant="metric">{seats}</AppText>
              <AppText variant="bodySmall" color={theme.colors.muted}>
                {seats === 1 ? "seat" : "seats"} of {departure.seatsAvailable} left
              </AppText>
            </View>
            <StepButton
              icon="add"
              label="One more seat"
              disabled={seats >= Math.min(departure.seatsAvailable, MAX_SEATS)}
              onPress={() => {
                void Haptics.selectionAsync();
                setSeats((current) =>
                  Math.min(Math.min(departure.seatsAvailable, MAX_SEATS), current + 1),
                );
                setOfferNgn(null);
              }}
            />
          </View>
        </Section>
      ) : null}

      {/* The bid — the same control as a city ride, against a posted fare */}
      <Section title="Name your price">
        <View style={styles.offerCard}>
          <OnLight>
          <View style={styles.offerHead}>
            <View style={styles.flex}>
              <AppText variant="monoSmall" color={theme.colors.orange}>
                YOUR OFFER
              </AppText>
              <AppText variant="metric">{formatNaira(currentOffer)}</AppText>
            </View>
            <View style={styles.listPrice}>
              <AppText variant="bodySmall" color={theme.colors.muted}>
                Posted fare
              </AppText>
              <AppText variant="monoLarge" color={theme.colors.muted}>
                {formatNaira(listPriceNgn)}
              </AppText>
            </View>
          </View>

          <View style={styles.stepperRow}>
            <StepButton
              icon="remove"
              label="Lower your offer"
              disabled={currentOffer <= floorNgn}
              onPress={() => adjustOffer(-OFFER_STEP_NGN)}
            />
            <View style={styles.stepperCentre}>
              <AppText variant="bodySmall" color={theme.colors.muted} style={styles.center}>
                {effectiveSeats === 1
                  ? "for 1 seat"
                  : `for ${effectiveSeats} seats`}
                {currentOffer !== listPriceNgn
                  ? ` · ${
                      isBid
                        ? `${formatNaira(listPriceNgn - currentOffer)} below`
                        : `${formatNaira(currentOffer - listPriceNgn)} above`
                    } fare`
                  : ""}
              </AppText>
            </View>
            <StepButton
              icon="add"
              label="Raise your offer"
              onPress={() => adjustOffer(OFFER_STEP_NGN)}
            />
          </View>

          {currentOffer <= floorNgn ? (
            <AppText variant="bodySmall" color={theme.colors.muted}>
              {formatNaira(floorNgn)} is the lowest offer drivers will see on this
              trip.
            </AppText>
          ) : null}
          </OnLight>
        </View>

        <Animated.View
          entering={FadeIn.duration(200)}
          style={[styles.outcome, isBid ? styles.outcomeBid : styles.outcomeInstant]}
        >
          <MaterialIcons
            name={isBid ? "gavel" : "check-circle"}
            size={18}
            color={isBid ? theme.colors.black : theme.colors.green}
          />
          <AppText variant="bodySmall" style={styles.flex}>
            {isBid
              ? "Drivers will see your offer and can accept it. Nothing is charged unless one does."
              : `${formatNaira(currentOffer)} will be paid from your wallet and your seat is confirmed straight away.`}
          </AppText>
        </Animated.View>
      </Section>

      <Section title="Who is travelling? (optional)">
        <Field
          label="Passenger name"
          placeholder="Leave blank if it is you"
          value={passengerName}
          onChangeText={setPassengerName}
        />
        <Field
          label="Passenger phone"
          placeholder="So the driver can reach them"
          value={passengerPhone}
          onChangeText={setPassengerPhone}
          keyboardType="phone-pad"
        />
        <Field
          label="Pickup note"
          placeholder="e.g. I will board at the Berger stop"
          value={pickupNote}
          onChangeText={setPickupNote}
        />
      </Section>

      <Animated.View entering={FadeInDown.duration(260)}>
        <AppButton
          title={
            isSubmitting
              ? isBid
                ? "Sending offer…"
                : "Booking…"
              : isBid
                ? `Offer ${formatNaira(currentOffer)}`
                : `Pay ${formatNaira(currentOffer)}`
          }
          disabled={isSubmitting || listPriceNgn <= 0}
          onPress={() => void submit()}
        />
      </Animated.View>
    </AppScreen>
  );
}

/* ── pieces ──────────────────────────────────────────────────────────────── */

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

function Row({
  icon,
  label,
  value,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.row}>
      <MaterialIcons name={icon} size={16} color={theme.colors.muted} />
      <AppText variant="bodySmall" color={theme.colors.muted} style={styles.rowLabel}>
        {label}
      </AppText>
      <AppText variant="bodyMedium" style={styles.rowValue} numberOfLines={1}>
        {value}
      </AppText>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

function Field({
  label,
  placeholder,
  value,
  onChangeText,
  keyboardType,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: "default" | "phone-pad";
}) {
  return (
    <View style={styles.field}>
      <AppText variant="monoSmall" color={theme.colors.muted}>
        {label.toUpperCase()}
      </AppText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.mutedLight}
        keyboardType={keyboardType ?? "default"}
        style={styles.input}
        selectionColor={theme.colors.orange}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: theme.spacing.xl, paddingBottom: theme.spacing.xxxl },
  missing: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.md,
  },
  center: { textAlign: "center" },
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
  },
  headerCopy: { flex: 1, gap: 2 },
  tripCard: {
    padding: theme.spacing.lg,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.white,
    ...theme.shadows.card,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  rowLabel: { width: 62 },
  rowValue: { flex: 1, textAlign: "right" },
  divider: { height: 1, backgroundColor: theme.colors.borderLight },
  section: { gap: theme.spacing.md },
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
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.orangeLight,
    ...theme.shadows.subtle,
  },
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
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.offWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  stepButtonUp: { backgroundColor: theme.colors.orangeLight },
  disabled: { opacity: 0.4 },
  offerCard: {
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.white,
    ...theme.shadows.card,
  },
  offerHead: {
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
  field: { gap: theme.spacing.xs },
  input: {
    height: 48,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.sm,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.white,
    fontFamily: theme.fonts.body,
    fontSize: 14,
    color: theme.colors.black,
  },
});
