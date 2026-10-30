import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";

import { RAvatar, RButton, RCard, RLink, RPill, RScreen, RText, naira, rider } from "@/components/rider/kit";
import { toUserMessage } from "@/lib/error-messages";
import { isCurrentLocationLabel, serializeRideItinerary, type RideItinerary } from "@/lib/ride-route";
import { useRideSession } from "@/lib/ride-session";
import { useGoHome } from "@/hooks/use-go-home";

const { colors, fonts } = rider;

const VERDICTS = ["", "Very bad", "Bad", "Okay", "Good", "Excellent"] as const;
const TAGS = ["Careful driving", "Clean car", "On time", "Friendly"] as const;

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function shortPlace(address: string): string {
  return address.split(",")[0]?.trim() ?? "";
}

/** The trip has ended: what it cost, a rating for the driver, and the same trip again. */
export default function TripRatingScreen() {
  const router = useRouter();
  const goHome = useGoHome();
  const isFocused = useIsFocused();
  const { clearRide, currentRide, submitRating } = useRideSession();
  const [rating, setRating] = useState(5);
  const [tags, setTags] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const leavingRef = useRef(false);

  const rideId = currentRide?.rideId ?? null;
  const hasRide = Boolean(currentRide);

  // This screen stays mounted between trips: each trip starts with a clean form.
  useEffect(() => {
    setRating(5);
    setTags([]);
    setIsSubmitting(false);
  }, [rideId]);

  // Come back to it with the trip already put away (after Repeat or Reverse): nothing to rate.
  useEffect(() => {
    if (!isFocused) {
      leavingRef.current = false;
      return;
    }
    if (!hasRide && !leavingRef.current) goHome();
  }, [hasRide, isFocused, router, goHome]);

  // The real driver from the trip that just ended.
  const driver = currentRide?.driver;
  const driverName = driver?.driverName?.trim() || "Your driver";
  const vehicleLine = [driver?.vehicleModel, driver?.vehiclePlate]
    .filter((part) => Boolean(part && part.trim()))
    .join(" · ");
  const canRate = Boolean(driver?.driverUserId);

  const itinerary = currentRide?.itinerary;
  const destination = itinerary?.stops[itinerary.stops.length - 1] ?? "";
  const tripLine = [
    destination,
    isNumber(currentRide?.plannedDistanceKm) ? `${currentRide.plannedDistanceKm.toFixed(1)} km` : null,
    isNumber(currentRide?.plannedDurationSeconds)
      ? `${Math.max(1, Math.round(currentRide.plannedDurationSeconds / 60))} min`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const paid = currentRide?.completedFareNgn;
  const agreed = driver?.lockedFareNgn;

  // Where the trip started, as an address: "Current location" means nothing as a destination.
  const pickupAddress = itinerary
    ? isCurrentLocationLabel(itinerary.pickup)
      ? currentRide?.route?.pickup?.address?.trim() || null
      : itinerary.pickup
    : null;
  const reversed: RideItinerary | null =
    itinerary && pickupAddress && destination
      ? { pickup: destination, stops: [...itinerary.stops.slice(0, -1).reverse(), pickupAddress] }
      : null;

  async function handleSubmit() {
    if (!canRate) {
      // Nothing to attach the rating to, so say so rather than pretending it
      // was sent.
      Alert.alert(
        "We could not find that trip",
        "Your rating could not be matched to a driver. You can rate from your ride history instead.",
        [{ text: "OK", onPress: () => goHome() }],
      );
      return;
    }

    setIsSubmitting(true);
    try {
      await submitRating({ rating, comment: tags.length > 0 ? tags.join(", ") : undefined });
      goHome();
    } catch (error) {
      Alert.alert(
        "Could not send your rating",
        toUserMessage(error, "Please try again in a moment."),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  /** The finished trip is put away, then the price screen opens with the same places. */
  function rideAgain(next: RideItinerary) {
    const serialized = serializeRideItinerary(next);
    leavingRef.current = true;
    clearRide();
    router.push({ pathname: "/ride-selection", params: { itinerary: serialized } });
  }

  function toggleTag(tag: string) {
    setTags((current) => (current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]));
  }

  return (
    <RScreen contentStyle={styles.container} scroll>
      <StatusBar style="dark" />

      <View style={styles.head}>
        <RPill icon="checkmark-circle" label="Trip completed" tone="green" />
        <RText accessibilityRole="header" variant="display">
          You have arrived
        </RText>
        {tripLine ? (
          <RText color={colors.muted} style={styles.tripLine}>
            {tripLine}
          </RText>
        ) : null}
      </View>

      <RCard style={styles.paid} tone="ink">
        <View style={styles.paidRow}>
          <RText color={colors.onInkMuted} variant="small">
            {isNumber(paid) ? "Paid from your wallet" : "Agreed price"}
          </RText>
          {isNumber(paid) || isNumber(agreed) ? (
            <RText color={colors.orange} style={styles.paidAmount}>
              {naira(isNumber(paid) ? paid : agreed)}
            </RText>
          ) : null}
        </View>
        {rideId ? (
          <View style={styles.paidFoot}>
            <RLink
              accessibilityLabel="Receipt"
              color={colors.orange}
              onPress={() => router.push({ pathname: "/trip-receipt", params: { rideId } })}
              title="Receipt"
            />
          </View>
        ) : null}
      </RCard>

      <RCard style={styles.rate}>
        <View style={styles.rateHead}>
          <RAvatar name={driver?.driverName} photoKey={driver?.driverPhotoKey} size={48} uri={driver?.driverPhotoUrl} />
          <View style={styles.rateText}>
            <RText style={styles.rateTitle}>Rate your driver</RText>
            <RText color={colors.muted} numberOfLines={1} variant="small">
              {[driverName, vehicleLine].filter(Boolean).join(" · ")}
            </RText>
          </View>
        </View>
        <View accessibilityLabel="Rate your driver" style={styles.stars}>
          {[1, 2, 3, 4, 5].map((value) => {
            const on = value <= rating;
            return (
              <Pressable
                accessibilityLabel={`${value} ${value === 1 ? "star" : "stars"}`}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                key={value}
                onPress={() => setRating(value)}
                style={({ pressed }) => [styles.star, on ? styles.starOn : null, pressed ? styles.pressed : null]}>
                <Ionicons color={on ? colors.orange : "#B9AE9C"} name="star" size={28} />
              </Pressable>
            );
          })}
        </View>
        <RText accessibilityLiveRegion="polite" color={colors.muted} variant="smallBold">
          {VERDICTS[rating]}
        </RText>
        <View style={styles.tags}>
          {TAGS.map((tag) => {
            const on = tags.includes(tag);
            return (
              <Pressable
                accessibilityLabel={tag}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                key={tag}
                onPress={() => toggleTag(tag)}
                style={({ pressed }) => [styles.tag, on ? styles.tagOn : null, pressed ? styles.pressed : null]}>
                <RText color={on ? colors.cream : colors.ink} style={styles.tagText}>
                  {tag}
                </RText>
              </Pressable>
            );
          })}
        </View>
      </RCard>

      {itinerary ? (
        <View style={styles.again}>
          {reversed && pickupAddress ? (
            <AgainCard
              note={`Back to ${shortPlace(pickupAddress)}`}
              onPress={() => rideAgain(reversed)}
              title="Reverse this ride"
            />
          ) : null}
          <AgainCard note="Same trip again" onPress={() => rideAgain(itinerary)} title="Repeat this ride" />
        </View>
      ) : null}

      <View style={styles.spacer} />

      <RButton
        loading={isSubmitting}
        onPress={() => void handleSubmit()}
        title="Submit rating"
      />
      <RLink
        color={rider.colors.muted}
        onPress={() => {
          leavingRef.current = true;
          clearRide();
          goHome();
        }}
        title="Skip for now"
      />
      <RLink
        accessibilityLabel="Report a problem with this trip"
        color={colors.muted}
        onPress={() => router.push("/support/chat")}
        title="Report a problem with this trip"
      />
    </RScreen>
  );
}

function AgainCard({ title, note, onPress }: { title: string; note: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityLabel={`${title}. ${note}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.againCard, pressed ? styles.pressed : null]}>
      <RText variant="bodyBold">{title}</RText>
      <RText color={colors.muted} numberOfLines={1} variant="small">
        {note}
      </RText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, paddingHorizontal: rider.gutter, paddingTop: 16, paddingBottom: 16, gap: 14 },
  pressed: { opacity: 0.72 },
  head: { gap: 10 },
  tripLine: { fontSize: 15, lineHeight: 21 },

  paid: { padding: 18, gap: 6 },
  paidRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  paidAmount: {
    fontFamily: fonts.display,
    fontSize: 40,
    lineHeight: 46,
    letterSpacing: -0.8,
    fontVariant: ["tabular-nums"],
    flexShrink: 0,
  },
  paidFoot: {
    flexDirection: "row",
    justifyContent: "flex-end",
    borderTopWidth: 1,
    borderTopColor: "#3A3A3A",
    paddingTop: 4,
  },

  rate: { gap: 12 },
  rateHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  rateText: { flex: 1, minWidth: 0 },
  rateTitle: { fontFamily: fonts.bold, fontSize: 18, lineHeight: 24 },
  stars: { flexDirection: "row", gap: 8 },
  star: {
    flex: 1,
    maxWidth: 56,
    height: 56,
    borderRadius: rider.radius.md,
    backgroundColor: colors.tint,
    alignItems: "center",
    justifyContent: "center",
  },
  starOn: { backgroundColor: colors.orangeSoft },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: {
    height: 44,
    paddingHorizontal: 14,
    borderRadius: rider.radius.pill,
    borderWidth: 2,
    borderColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  tagOn: { backgroundColor: colors.ink },
  tagText: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 19 },

  again: { flexDirection: "row", gap: 10 },
  againCard: {
    flex: 1,
    minWidth: 0,
    minHeight: 64,
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: rider.radius.lg,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.ink,
  },

  spacer: { flexGrow: 1 },
});
