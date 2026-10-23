import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";

import { naira, rider } from "@/constants/rider-theme";

const { colors, fonts, radius } = rider;

/** One tap on minus or plus moves the price to the next ₦100. */
export const PRICE_STEP_NGN = 100;

/** The next ₦100 down: ₦6,050 goes to ₦6,000, ₦6,000 to ₦5,900. Never under the floor. */
export function stepPriceDown(price: number, floor: number): number {
  return Math.max(floor, price - (price % PRICE_STEP_NGN || PRICE_STEP_NGN));
}

/** The next ₦100 up: ₦5,850 goes to ₦5,900. */
export function stepPriceUp(price: number): number {
  return price + (PRICE_STEP_NGN - (price % PRICE_STEP_NGN));
}

/**
 * The dark card where the rider sets a price: the figure between a minus and
 * a plus, with a line above it and whatever the screen adds below.
 */
export function PriceCard({
  label,
  sideLabel,
  sideValue,
  amountNgn,
  minNgn,
  onChange,
  loading = false,
  children,
}: {
  label: string;
  /** Small text on the right of the top line: "Suggested price", "Current". */
  sideLabel?: string;
  sideValue?: string | null;
  amountNgn: number;
  minNgn: number;
  onChange: (next: number) => void;
  /** The price for this trip is still on its way: no number is shown, and nothing can be changed yet. */
  loading?: boolean;
  children?: ReactNode;
}) {
  const atFloor = loading || amountNgn <= minNgn;

  function change(next: number) {
    if (next === amountNgn) return;
    void Haptics.selectionAsync();
    onChange(next);
  }

  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <Text maxFontSizeMultiplier={1.2} style={styles.label}>
          {label}
        </Text>
        {loading && sideLabel ? (
          <Text maxFontSizeMultiplier={1.2} style={styles.side}>
            {sideLabel} <Text style={styles.sideValue}>…</Text>
          </Text>
        ) : sideLabel && sideValue ? (
          <Text maxFontSizeMultiplier={1.2} style={styles.side}>
            {sideLabel} <Text style={styles.sideValue}>{sideValue}</Text>
          </Text>
        ) : null}
      </View>

      <View style={styles.stepper}>
        <Pressable
          accessibilityLabel="Lower by 100 naira"
          accessibilityRole="button"
          accessibilityState={{ disabled: atFloor }}
          disabled={atFloor}
          onPress={() => change(stepPriceDown(amountNgn, minNgn))}
          style={({ pressed }) => [
            styles.round,
            styles.minus,
            atFloor ? styles.dimmed : null,
            pressed ? styles.pressed : null,
          ]}>
          <Ionicons color={colors.cream} name="remove" size={26} />
        </Pressable>

        {loading ? (
          <View style={styles.figureSlot}>
            <PriceShimmer />
          </View>
        ) : (
          <PriceDrop>
            <Text
              accessibilityLiveRegion="polite"
              adjustsFontSizeToFit
              maxFontSizeMultiplier={1}
              minimumFontScale={0.5}
              numberOfLines={1}
              style={styles.figure}>
              {naira(amountNgn)}
            </Text>
          </PriceDrop>
        )}

        <Pressable
          accessibilityLabel="Raise by 100 naira"
          accessibilityRole="button"
          accessibilityState={{ disabled: loading }}
          disabled={loading}
          onPress={() => change(stepPriceUp(amountNgn))}
          style={({ pressed }) => [styles.round, styles.plus, loading ? styles.dimmed : null, pressed ? styles.pressed : null]}>
          <Ionicons color={colors.ink} name="add" size={26} />
        </Pressable>
      </View>

      {children}
    </View>
  );
}

/**
 * Where the price goes while it is on its way: a bar with a light sweeping
 * across it, again and again, so the screen plainly says "working on it"
 * without showing a number that might be wrong.
 */
export function PriceShimmer({ width = 168, height = 44, onInk = true }: { width?: number; height?: number; onInk?: boolean }) {
  const sweep = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(sweep, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [sweep]);
  const band = Math.max(40, Math.round(width * 0.45));
  return (
    <View
      accessibilityLabel="Getting the price for this trip"
      accessible
      style={{
        width,
        height,
        borderRadius: Math.min(12, height / 2),
        backgroundColor: onInk ? colors.inkLine : colors.line,
        overflow: "hidden",
        alignSelf: "center",
      }}>
      <Animated.View
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          width: band,
          backgroundColor: onInk ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.7)",
          transform: [
            { translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-band, width] }) },
            { skewX: "-18deg" },
          ],
        }}
      />
    </View>
  );
}

/**
 * The price arriving: it drops into place with a small bounce and a tap on
 * the hand, so the moment the real quote lands is felt as well as seen.
 */
function PriceDrop({ children }: { children: ReactNode }) {
  const drop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.spring(drop, { toValue: 1, friction: 6, tension: 120, useNativeDriver: true }).start();
  }, [drop]);
  return (
    <Animated.View
      style={{
        flex: 1,
        opacity: drop.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 1, 1] }),
        transform: [{ translateY: drop.interpolate({ inputRange: [0, 1], outputRange: [-22, 0] }) }],
      }}>
      {children}
    </Animated.View>
  );
}

/** A line of small text inside the price card. */
export function PriceCardNote({ children, strong }: { children: ReactNode; strong?: boolean }) {
  return (
    <Text
      accessibilityLiveRegion="polite"
      maxFontSizeMultiplier={1.2}
      style={[styles.note, strong ? styles.noteStrong : null]}>
      {children}
    </Text>
  );
}

/** A quiet outlined button inside the price card: "+ ₦200", "Reset". */
export function PriceCardChip({
  title,
  onPress,
  accessibilityLabel,
}: {
  title: string;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.chip, pressed ? styles.pressed : null]}>
      <Text maxFontSizeMultiplier={1.15} numberOfLines={1} style={styles.chipText}>
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { padding: 18, borderRadius: 24, backgroundColor: colors.ink, gap: 12 },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 12 },
  label: { fontFamily: fonts.regular, fontSize: 15, color: colors.onInkMuted },
  side: { flexShrink: 1, fontFamily: fonts.regular, fontSize: 14, color: colors.onInkMuted },
  sideValue: { fontFamily: fonts.bold, color: colors.cream, fontVariant: ["tabular-nums"] },
  stepper: { flexDirection: "row", alignItems: "center", gap: 12 },
  round: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  minus: { borderWidth: 2, borderColor: colors.inkLine },
  plus: { backgroundColor: colors.orange },
  figureSlot: { flex: 1, alignItems: "center", justifyContent: "center" },
  figure: {
    textAlign: "center",
    fontFamily: fonts.display,
    fontSize: 54,
    lineHeight: 60,
    letterSpacing: -1.6,
    color: colors.orange,
    fontVariant: ["tabular-nums"],
    includeFontPadding: false,
  },
  note: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 19, color: colors.onInkMuted },
  noteStrong: { fontFamily: fonts.semibold, color: colors.cream },
  chip: {
    flex: 1,
    height: 44,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.inkLine,
    alignItems: "center",
    justifyContent: "center",
  },
  chipText: { fontFamily: fonts.bold, fontSize: 15, color: colors.cream, fontVariant: ["tabular-nums"] },
  dimmed: { opacity: 0.4 },
  pressed: { opacity: 0.72 },
});
