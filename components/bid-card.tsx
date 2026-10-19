import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import Animated, { FadeInDown, FadeOutLeft, Layout } from "react-native-reanimated";

import { AppText, OnLight } from "@/components/app-text";
import type { RideOffer } from "@/lib/ride-session";
import { theme } from "@/theme";

const ngn = (value: number) => `₦${Math.round(value).toLocaleString("en-NG")}`;

function etaLabel(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes} min away`;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "D";
}

/**
 * One driver's bid.
 *
 * The rider has three answers, and all three are one tap away: take it, haggle,
 * or make it go away. Hiding any of them behind a menu is what makes a bidding
 * screen feel slow, because every card is a decision the rider is already
 * holding in their head.
 */
export function BidCard({
  offer,
  index,
  isCheapest,
  minOfferNgn,
  busy,
  onAccept,
  onCounter,
  onDismiss,
}: {
  offer: RideOffer;
  index: number;
  isCheapest: boolean;
  minOfferNgn?: number;
  busy?: boolean;
  onAccept: () => void;
  onCounter: (amountNgn: number) => void;
  onDismiss: () => void;
}) {
  const [isCountering, setIsCountering] = useState(false);
  const [counterValue, setCounterValue] = useState(String(offer.counterOfferNgn));

  // A driver who re-bids invalidates whatever the rider was typing at their old
  // price, so the field follows the live number instead of going stale.
  useEffect(() => {
    setCounterValue(String(offer.counterOfferNgn));
  }, [offer.counterOfferNgn]);

  const floor = minOfferNgn ?? 0;
  const typed = Number(counterValue.replace(/[^\d]/g, ""));
  const counterIsValid = Number.isFinite(typed) && typed >= floor && typed > 0;

  function step(delta: number) {
    void Haptics.selectionAsync();
    const next = Math.max(floor, (Number.isFinite(typed) ? typed : offer.counterOfferNgn) + delta);
    setCounterValue(String(next));
  }

  return (
    <Animated.View
      entering={FadeInDown.delay(Math.min(index, 6) * 70)
        .duration(320)
        .springify()
        .damping(18)}
      exiting={FadeOutLeft.duration(200)}
      layout={Layout.springify().damping(20)}
      style={[styles.card, isCheapest && styles.cardBest]}
    >
      <OnLight>
      {isCheapest ? (
        <View style={styles.bestTag}>
          <OnLight>
          <AppText variant="monoSmall" color={theme.colors.black}>
            BEST PRICE
          </AppText>
          </OnLight>
        </View>
      ) : null}

      <View style={styles.headRow}>
        <View style={styles.avatar}>
          <OnLight>
          <AppText variant="bodyMedium" color={theme.colors.black}>
            {initialsOf(offer.driverName)}
          </AppText>
          </OnLight>
        </View>

        <View style={styles.identity}>
          <AppText variant="bodyMedium" color={theme.colors.black} numberOfLines={1}>
            {offer.driverName}
          </AppText>
          <AppText variant="bodySmall" color={theme.colors.muted} numberOfLines={1}>
            {offer.driverRating > 0 ? `★ ${offer.driverRating.toFixed(1)}` : "New driver"}
            {offer.vehicleModel ? ` · ${offer.vehicleModel}` : ""}
            {offer.vehiclePlate ? ` · ${offer.vehiclePlate}` : ""}
          </AppText>
        </View>

        <View style={styles.priceBlock}>
          <AppText variant="monoLarge" color={theme.colors.black}>
            {ngn(offer.counterOfferNgn)}
          </AppText>
          <AppText variant="bodySmall" color={theme.colors.muted}>
            {etaLabel(offer.etaSeconds)}
          </AppText>
        </View>
      </View>

      {offer.riderCounterNgn !== undefined ? (
        <View style={styles.pendingRow}>
          <MaterialIcons name="schedule" size={14} color={theme.colors.muted} />
          <AppText variant="bodySmall" color={theme.colors.muted}>
            You offered {ngn(offer.riderCounterNgn)} — waiting for their reply
          </AppText>
        </View>
      ) : null}

      {isCountering ? (
        <View style={styles.counterRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Lower your offer"
            onPress={() => step(-500)}
            style={styles.stepButton}
          >
            <OnLight>
            <MaterialIcons name="remove" size={18} color={theme.colors.black} />
            </OnLight>
          </Pressable>

          <View style={styles.counterField}>
            <OnLight>
            <AppText variant="bodyMedium" color={theme.colors.muted}>
              ₦
            </AppText>
            <TextInput
              keyboardType="number-pad"
              value={counterValue}
              onChangeText={(next) => setCounterValue(next.replace(/[^\d]/g, ""))}
              style={styles.counterInput}
              selectionColor={theme.colors.orange}
              autoFocus
            />
            </OnLight>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Raise your offer"
            onPress={() => step(500)}
            style={styles.stepButton}
          >
            <OnLight>
            <MaterialIcons name="add" size={18} color={theme.colors.black} />
            </OnLight>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            disabled={!counterIsValid || busy}
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onCounter(typed);
              setIsCountering(false);
            }}
            style={[styles.sendCounter, (!counterIsValid || busy) && styles.disabled]}
          >
            <AppText variant="bodySmall" color={theme.colors.offWhite}>
              Send
            </AppText>
          </Pressable>
        </View>
      ) : (
        <View style={styles.actionRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Decline ${offer.driverName}`}
            disabled={busy}
            onPress={() => {
              void Haptics.selectionAsync();
              onDismiss();
            }}
            style={[styles.action, styles.decline]}
          >
            <OnLight>
            <MaterialIcons name="close" size={18} color={theme.colors.black} />
            </OnLight>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Offer a different price to ${offer.driverName}`}
            disabled={busy}
            onPress={() => {
              void Haptics.selectionAsync();
              setIsCountering(true);
            }}
            style={[styles.action, styles.haggle]}
          >
            <OnLight>
            <AppText variant="bodySmall" color={theme.colors.black}>
              Offer less
            </AppText>
            </OnLight>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Accept ${ngn(offer.counterOfferNgn)} from ${offer.driverName}`}
            disabled={busy}
            onPress={() => {
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              onAccept();
            }}
            style={[styles.action, styles.accept, busy && styles.disabled]}
          >
            <AppText variant="bodySmall" color={theme.colors.offWhite}>
              Accept {ngn(offer.counterOfferNgn)}
            </AppText>
          </Pressable>
        </View>
      )}
      </OnLight>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.offWhite,
    borderRadius: theme.radius.lg,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.borderLight,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    ...theme.shadows.subtle,
  },
  cardBest: { borderWidth: theme.borders.thick, borderColor: theme.colors.orange },
  bestTag: {
    alignSelf: "flex-start",
    backgroundColor: theme.colors.orangeLight,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    marginBottom: theme.spacing.sm,
  },
  headRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.orangeLight,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.black,
    alignItems: "center",
    justifyContent: "center",
  },
  identity: { flex: 1, gap: 2 },
  priceBlock: { alignItems: "flex-end" },
  pendingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
    marginTop: theme.spacing.sm,
  },
  actionRow: { flexDirection: "row", gap: theme.spacing.sm, marginTop: theme.spacing.lg },
  action: {
    height: 44,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  decline: { width: 48, backgroundColor: theme.colors.offWhite },
  haggle: { flex: 1, backgroundColor: theme.colors.orangeLight },
  accept: { flex: 2, backgroundColor: theme.colors.black },
  disabled: { opacity: 0.5 },
  counterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    marginTop: theme.spacing.lg,
  },
  stepButton: {
    width: 40,
    height: 44,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.offWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  counterField: {
    flex: 1,
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.offWhite,
  },
  counterInput: {
    flex: 1,
    fontSize: 16,
    color: theme.colors.black,
    padding: 0,
  },
  sendCounter: {
    height: 44,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.black,
    alignItems: "center",
    justifyContent: "center",
  },
});
