import { useEffect, useRef } from "react";
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { RButton, RText, rider } from "@/components/rider/kit";
import type { SafetyCard, SafetyCards, SafetyTone } from "@/lib/rider-safety";

const { colors, fonts } = rider;

/** The card's fill and words, from the rider app's own colours (the ride page uses the same ones). */
const TONE: Record<SafetyTone, { bg: string; fg: string }> = {
  orange: { bg: colors.orangeSoft, fg: colors.ink },
  ink: { bg: colors.ink, fg: colors.cream },
  cream: { bg: colors.tint, fg: colors.ink },
  green: { bg: colors.greenSoft, fg: colors.green },
  sky: { bg: "#E4EEFB", fg: "#0B2A57" },
  pink: { bg: "#FBE6EE", fg: "#5B1230" },
};

/**
 * One safety tip (Timi, 21 Nov 2026): a small card, still until the moment of the ride changes. A new card comes in
 * once (a short rise, the picture bounces); the same card again stays put.
 */
export function SafetyTipCard({ card, current = false, animate = true }: { card: SafetyCard; current?: boolean; animate?: boolean }) {
  const tone = TONE[card.tone] ?? TONE.cream;
  const shown = useRef(new Animated.Value(1)).current;
  const lastKey = useRef(card.key);
  useEffect(() => {
    if (!animate || lastKey.current === card.key) return;
    lastKey.current = card.key;
    shown.setValue(0);
    Animated.timing(shown, { toValue: 1, duration: 420, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true }).start();
  }, [animate, card.key, shown]);
  const lift = shown.interpolate({ inputRange: [0, 1], outputRange: [8, 0] });
  const pop = shown.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.5, 1.12, 1] });
  return (
    <Animated.View
      accessibilityLabel={`${card.kick}. ${card.title}. ${card.line}`}
      accessible
      style={[styles.card, { backgroundColor: tone.bg, opacity: shown, transform: [{ translateY: lift }] }, current && styles.current]}>
      <Animated.Text style={[styles.emoji, { transform: [{ scale: pop }] }]}>{card.emoji}</Animated.Text>
      <View style={styles.text}>
        <RText color={tone.fg} style={styles.kick}>{card.kick}</RText>
        <RText color={tone.fg} style={styles.title}>{card.title}</RText>
        <RText color={tone.fg} variant="small">{card.line}</RText>
      </View>
    </Animated.View>
  );
}

/** Every tip of the ride, by when it matters; the one on screen outlined. */
export function SafetyTipsSheet({ cards, currentKey, open, onClose }: { cards: SafetyCards; currentKey?: string | null; open: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={open}>
      <Pressable accessibilityLabel="Close" onPress={onClose} style={styles.backdrop}>
        <Pressable onPress={() => undefined} style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <RText accessibilityRole="header" variant="heading">Safety tips for this ride</RText>
          <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false} style={styles.scroll}>
            {cards.groups.map((group) => (
              <View key={group.title} style={styles.group}>
                <RText variant="label">{group.title.toUpperCase()}</RText>
                {group.cards.map((card) => (
                  <SafetyTipCard animate={false} card={card} current={card.key === currentKey} key={card.key} />
                ))}
              </View>
            ))}
          </ScrollView>
          <RButton onPress={onClose} title="Close" />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderRadius: rider.radius.lg },
  current: { borderWidth: 2, borderColor: colors.orange },
  emoji: { fontSize: 24, lineHeight: 28 },
  text: { flex: 1, gap: 2 },
  kick: { fontFamily: fonts.heavy, fontSize: 11, lineHeight: 14, letterSpacing: 0.6, textTransform: "uppercase", opacity: 0.7 },
  title: { fontFamily: fonts.display, fontSize: 16, lineHeight: 20, letterSpacing: -0.2 },
  backdrop: { flex: 1, backgroundColor: "rgba(13,13,13,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.cream, borderTopLeftRadius: rider.radius.sheet, borderTopRightRadius: rider.radius.sheet, paddingHorizontal: rider.gutter, paddingTop: 20, gap: 12, maxHeight: "86%" },
  scroll: { flexGrow: 0 },
  list: { gap: 14, paddingBottom: 4 },
  group: { gap: 8 },
});
