import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from "react-native";

import { brand } from "@/constants/brand";
import { theme } from "@/theme";

/**
 * Small moving pieces drawn over the car scene, each showing in a second what
 * a sentence would take longer to say: a price being agreed, a car coming to
 * a pickup, money being earned. All of them hold still for anyone who has
 * asked the phone to reduce motion.
 */

function useMotion(run: () => Animated.CompositeAnimation | null, rest: () => void) {
  useEffect(() => {
    let animation: Animated.CompositeAnimation | null = null;
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((still) => {
      if (cancelled) return;
      if (still) {
        rest();
        return;
      }
      animation = run();
      animation?.start();
    });
    return () => {
      cancelled = true;
      animation?.stop();
    };
    // Each caller's animation is built once, from refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** Round fares a Lagos rider would recognise: ₦5,000 to ₦8,000 in steps of ₦500. */
const FARES = [5000, 5500, 6000, 6500, 7000, 7500, 8000];
const anotherFare = (last: number): number => {
  const choices = FARES.filter((fare) => fare !== last);
  return choices[Math.floor(Math.random() * choices.length)];
};

/**
 * A price being agreed, over and over: the rider names it, a driver takes it.
 * The whole idea of Wheelers, shown before a word is read.
 */
export function PriceTalk({ bottom }: { bottom: number }) {
  // A different round fare each time, picked at random, never the same twice running.
  const [fare, setFare] = useState(() => anotherFare(0));
  const offer = useRef(new Animated.Value(0)).current;
  const deal = useRef(new Animated.Value(0)).current;

  useMotion(
    () => {
      const round = Animated.sequence([
        Animated.timing(offer, { toValue: 1, duration: 320, easing: Easing.out(Easing.back(1.6)), useNativeDriver: true }),
        Animated.delay(700),
        Animated.timing(deal, { toValue: 1, duration: 320, easing: Easing.out(Easing.back(1.8)), useNativeDriver: true }),
        Animated.delay(1700),
        Animated.parallel([
          Animated.timing(offer, { toValue: 0, duration: 260, useNativeDriver: true }),
          Animated.timing(deal, { toValue: 0, duration: 260, useNativeDriver: true }),
        ]),
        Animated.delay(450),
      ]);
      const loop = {
        start: () => {
          const again = () =>
            round.start(({ finished }) => {
              if (!finished) return;
              setFare((current) => anotherFare(current));
              round.reset();
              again();
            });
          again();
        },
        stop: () => round.stop(),
      } as unknown as Animated.CompositeAnimation;
      return loop;
    },
    () => {
      offer.setValue(1);
      deal.setValue(1);
    },
  );

  const pop = (value: Animated.Value) => ({
    opacity: value,
    transform: [{ scale: value.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }],
  });

  return (
    <View pointerEvents="none" style={[styles.talk, { bottom }]}>
      <Animated.View style={[styles.bubble, styles.offer, pop(offer)]}>
        <Text style={styles.bubbleSmall}>You offer</Text>
        <Text style={styles.bubblePrice}>{`₦${fare.toLocaleString("en-NG")}`}</Text>
      </Animated.View>
      <Animated.View style={[styles.bubble, styles.deal, pop(deal)]}>
        <Ionicons color={brand.ink} name="checkmark-circle" size={18} />
        <Text style={styles.dealText}>Driver accepts</Text>
      </Animated.View>
    </View>
  );
}

/** Where the rider is waiting: a pin with a ring going out from it, and the car on its way there. */
export function PickupPin({ bottom, right }: { bottom: number; right: number }) {
  const ring = useRef(new Animated.Value(0)).current;
  useMotion(
    () => Animated.loop(Animated.timing(ring, { toValue: 1, duration: 1600, easing: Easing.out(Easing.quad), useNativeDriver: true })),
    () => ring.setValue(0),
  );
  return (
    <View pointerEvents="none" style={[styles.pin, { bottom, right }]}>
      <Animated.View
        style={[
          styles.ring,
          {
            opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
            transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [0.4, 2.2] }) }],
          },
        ]}
      />
      <Ionicons color={theme.colors.orange} name="location" size={30} />
    </View>
  );
}

/** Money coming off a car at work: naira chips rising one after another. */
export function EarningCoins({ bottom }: { bottom: number }) {
  const coins = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  useMotion(
    () =>
      Animated.loop(
        Animated.stagger(
          620,
          coins.map((coin) =>
            Animated.sequence([
              Animated.timing(coin, { toValue: 1, duration: 1500, easing: Easing.out(Easing.quad), useNativeDriver: true }),
              Animated.timing(coin, { toValue: 0, duration: 0, useNativeDriver: true }),
              Animated.delay(360),
            ]),
          ),
        ),
      ),
    () => coins[0].setValue(0.35),
  );
  return (
    <View pointerEvents="none" style={[styles.coins, { bottom }]}>
      {coins.map((coin, index) => (
        <Animated.View
          key={index}
          style={[
            styles.coin,
            { left: 34 + index * 46 },
            {
              opacity: coin.interpolate({ inputRange: [0, 0.15, 0.75, 1], outputRange: [0, 1, 1, 0] }),
              transform: [
                { translateY: coin.interpolate({ inputRange: [0, 1], outputRange: [0, -46] }) },
                { scale: coin.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.6, 1, 1] }) },
              ],
            },
          ]}>
          <Text style={styles.coinText}>+₦</Text>
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  talk: { position: "absolute", left: 0, right: 0, alignItems: "center", gap: 8 },
  bubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: theme.borders.thick,
    borderColor: brand.ink,
    borderRadius: 999,
  },
  offer: { backgroundColor: theme.colors.white, marginRight: 96 },
  deal: { backgroundColor: theme.colors.orange, marginLeft: 96 },
  bubbleSmall: { ...theme.typography.bodySmall, color: brand.muted },
  bubblePrice: { ...theme.typography.label, color: brand.ink, fontVariant: ["tabular-nums"] },
  dealText: { ...theme.typography.label, color: brand.ink },
  pin: { position: "absolute", width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  ring: { position: "absolute", width: 30, height: 30, borderRadius: 15, backgroundColor: theme.colors.orange },
  coins: { position: "absolute", alignSelf: "center", width: 204, height: 60 },
  coin: {
    position: "absolute",
    bottom: 0,
    minWidth: 40,
    alignItems: "center",
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderWidth: theme.borders.thick,
    borderColor: brand.ink,
    borderRadius: 999,
    backgroundColor: "#D8F5E7",
  },
  coinText: { ...theme.typography.label, color: brand.ink },
});
