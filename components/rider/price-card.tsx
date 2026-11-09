import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AppState,
  Animated,
  Easing,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { naira, rider } from "@/constants/rider-theme";
import { settleTypedPrice } from "@/lib/typed-price";

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
  onEditingChange,
  loading = false,
  reason,
  note,
  children,
}: {
  label: string;
  /** Small text on the right of the top line: "Suggested price", "Current". */
  sideLabel?: string;
  sideValue?: string | null;
  amountNgn: number;
  minNgn: number;
  onChange: (next: number) => void;
  /** The rider is typing the price: the screen holds its button until they are done. */
  onEditingChange?: (editing: boolean) => void;
  /** The price for this trip is still on its way: no number is shown, and nothing can be changed yet. */
  loading?: boolean;
  /** One small line under the figure: why the price is up ("Busy in this area · +₦1,200"). */
  reason?: string | null;
  /** One line under the card's figure ("Minimum offer: ₦X"); "Lowest is ₦X" takes its place after a typed price is raised to the floor. */
  note?: string | null;
  children?: ReactNode;
}) {
  const atFloor = loading || amountNgn <= minNgn;
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [lowNote, setLowNote] = useState<string | null>(null);
  const committed = useRef<number | null>(null);
  const editingRef = useRef(false);
  const textRef = useRef("");
  const startTextRef = useRef("");
  const latest = useRef({ amountNgn, minNgn, onChange, onEditingChange });
  latest.current = { amountNgn, minNgn, onChange, onEditingChange };

  // A change that did not come from typing (a chip, the screen) clears the "Lowest is" line.
  useEffect(() => {
    if (committed.current !== amountNgn) setLowNote(null);
  }, [amountNgn]);

  function setEditingBoth(next: boolean) {
    editingRef.current = next;
    setEditing(next);
    latest.current.onEditingChange?.(next);
  }

  /** Done: runs once however it is reached (Done key, blur, keyboard hidden, background, unmount). */
  function finishTyping(sendNow = true): number | null {
    if (!editingRef.current) return null;
    const { amountNgn: before, minNgn: floor, onChange: send } = latest.current;
    const typed = textRef.current;
    editingRef.current = false;
    setEditingBoth(false);
    const got = settleTypedPrice(typed, startTextRef.current, before, floor);
    if (got.changed || got.low) setLowNote(got.low ? `Lowest is ${naira(got.amount)}` : null);
    if (got.changed) committed.current = got.amount;
    if (sendNow && got.changed) {
      void Haptics.selectionAsync();
      send(got.amount);
    }
    return got.amount;
  }
  const finishRef = useRef(finishTyping);
  finishRef.current = finishTyping;

  // Android Back closes the keyboard without a blur; the app going away ends it too.
  useEffect(() => {
    if (!editing) return;
    const hide = Keyboard.addListener("keyboardDidHide", () => finishRef.current());
    const app = AppState.addEventListener("change", (state) => {
      if (state !== "active") finishRef.current();
    });
    return () => {
      hide.remove();
      app.remove();
    };
  }, [editing]);

  // Leaving the screen mid-typing: abandoned, not committed; only free the screen's button.
  useEffect(
    () => () => {
      editingRef.current = false;
      latest.current.onEditingChange?.(false);
    },
    [],
  );

  // The price went back to loading: no typing over it.
  useEffect(() => {
    if (loading && editingRef.current) {
      editingRef.current = false;
      setEditing(false);
      latest.current.onEditingChange?.(false);
    }
  }, [loading]);

  /** -/+: what was typed is committed first, then the step is taken from it (one change sent). */
  function step(stepFrom: (price: number) => number) {
    const base = finishTyping(false) ?? amountNgn;
    const next = stepFrom(base);
    if (next === amountNgn) return;
    void Haptics.selectionAsync();
    setLowNote(null);
    committed.current = null;
    onChange(next);
  }

  function startTyping() {
    if (loading) return;
    const start = String(Math.round(amountNgn));
    textRef.current = start;
    startTextRef.current = start;
    setText(start);
    setLowNote(null);
    setEditingBoth(true);
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
          onPress={() => step((price) => stepPriceDown(price, minNgn))}
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
            {editing ? (
              <TextInput
                accessibilityLabel="Type your offer in naira"
                autoFocus
                keyboardType="number-pad"
                maxFontSizeMultiplier={1}
                maxLength={7}
                onBlur={() => finishTyping()}
                onChangeText={(value) => {
                  const digits = value.replace(/[^0-9]/g, "");
                  textRef.current = digits;
                  setText(digits);
                }}
                onSubmitEditing={() => finishTyping()}
                returnKeyType="done"
                selectTextOnFocus
                style={[styles.figure, styles.figureInput]}
                value={text}
              />
            ) : (
              <Pressable
                accessibilityHint="Tap to type a price"
                accessibilityLabel={`${label} ${naira(amountNgn)}`}
                accessibilityLiveRegion="polite"
                accessibilityRole="button"
                onPress={startTyping}
                style={styles.figureTap}>
                <Text
                  adjustsFontSizeToFit
                  maxFontSizeMultiplier={1}
                  minimumFontScale={0.5}
                  numberOfLines={1}
                  style={styles.figure}>
                  {naira(amountNgn)}
                </Text>
              </Pressable>
            )}
          </PriceDrop>
        )}

        <Pressable
          accessibilityLabel="Raise by 100 naira"
          accessibilityRole="button"
          accessibilityState={{ disabled: loading }}
          disabled={loading}
          onPress={() => step(stepPriceUp)}
          style={({ pressed }) => [styles.round, styles.plus, loading ? styles.dimmed : null, pressed ? styles.pressed : null]}>
          <Ionicons color={colors.ink} name="add" size={26} />
        </Pressable>
      </View>

      {lowNote && !editing ? (
        <Text accessibilityLiveRegion="polite" maxFontSizeMultiplier={1.2} style={styles.reason}>
          {lowNote}
        </Text>
      ) : note ? (
        <PriceCardNote>{note}</PriceCardNote>
      ) : null}

      {reason && !loading ? (
        <Text maxFontSizeMultiplier={1.2} numberOfLines={1} style={styles.reason}>
          {reason}
        </Text>
      ) : null}

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
  label: { fontFamily: fonts.regular, fontSize: 14, color: colors.onInkMuted },
  side: { flexShrink: 1, fontFamily: fonts.regular, fontSize: 13, color: colors.onInkMuted },
  sideValue: { fontFamily: fonts.bold, color: colors.cream, fontVariant: ["tabular-nums"] },
  stepper: { flexDirection: "row", alignItems: "center", gap: 12 },
  round: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  minus: { borderWidth: 2, borderColor: colors.inkLine },
  plus: { backgroundColor: colors.orange },
  figureSlot: { flex: 1, alignItems: "center", justifyContent: "center" },
  figureTap: { minHeight: 44, justifyContent: "center" },
  figureInput: { alignSelf: "stretch", minHeight: 60, padding: 0 },
  figure: {
    textAlign: "center",
    fontFamily: fonts.display,
    fontSize: 46,
    lineHeight: 51,
    letterSpacing: -1.6,
    color: colors.orange,
    fontVariant: ["tabular-nums"],
    includeFontPadding: false,
  },
  reason: {
    marginTop: -6,
    textAlign: "center",
    fontFamily: fonts.semibold,
    fontSize: 13,
    lineHeight: 17,
    color: colors.onInkSoft,
    fontVariant: ["tabular-nums"],
  },
  note: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.onInkMuted },
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
  chipText: { fontFamily: fonts.bold, fontSize: 14, color: colors.cream, fontVariant: ["tabular-nums"] },
  dimmed: { opacity: 0.4 },
  pressed: { opacity: 0.72 },
});
