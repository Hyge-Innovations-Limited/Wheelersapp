import { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";

import { RText, rider } from "@/components/rider/kit";
import { naira } from "@/constants/rider-theme";
import { minutesSeconds, waitingClock, type WaitingInfo } from "@/lib/waiting";

const { colors, fonts, radius } = rider;

/**
 * The driver is at the pickup: the free minutes count down, then the waiting
 * fee ticks up (₦70 a minute after 5 free), until the trip starts. The same
 * card as the WhatsApp ride page (widget/ride/ride.html #d-wait).
 */
export function WaitingCard({ waiting }: { waiting: WaitingInfo }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const clock = waitingClock(waiting, now);

  // The figure drops in each time the fee goes up; the dot breathes while it runs.
  const drop = useRef(new Animated.Value(1)).current;
  const shownFee = useRef<number | null>(null);
  useEffect(() => {
    if (clock.free) { shownFee.current = null; return; }
    if (shownFee.current !== null && shownFee.current !== clock.feeNgn) {
      drop.setValue(0);
      Animated.timing(drop, { toValue: 1, duration: 450, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    }
    shownFee.current = clock.feeNgn;
  }, [clock.free, clock.feeNgn, drop]);
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (clock.free || clock.stopped) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.25, duration: 800, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [clock.free, clock.stopped, pulse]);

  if (!(waiting.ngnPerMinute > 0)) return null;

  if (clock.free) {
    const left = waiting.freeSeconds > 0 ? clock.freeLeftSeconds / waiting.freeSeconds : 0;
    return (
      <View accessibilityLabel={`Free waiting, ${minutesSeconds(clock.freeLeftSeconds)} left`} accessible style={styles.card}>
        <View style={styles.top}>
          <RText color={colors.muted} style={styles.label}>Free waiting</RText>
          <RText style={styles.figure} variant="figure">{minutesSeconds(clock.freeLeftSeconds)}</RText>
        </View>
        <View style={styles.bar}>
          <View style={[styles.fill, { width: `${Math.round(left * 1000) / 10}%` }]} />
        </View>
        <RText color={colors.muted} style={styles.note}>Then {naira(waiting.ngnPerMinute)}/min</RText>
      </View>
    );
  }

  return (
    <View
      accessibilityLabel={`Waiting time ${clock.chargedMinutes} minutes, ${naira(clock.feeNgn)}`}
      accessibilityLiveRegion="polite"
      accessible
      style={styles.card}>
      <View style={styles.top}>
        <View style={styles.labelRow}>
          {clock.stopped ? null : <Animated.View style={[styles.dot, { opacity: pulse }]} />}
          <RText color={colors.muted} style={styles.label}>Waiting time</RText>
        </View>
        <Animated.View style={{ opacity: drop, transform: [{ translateY: drop.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }] }}>
          <RText color={colors.orangeText} style={styles.figure} variant="figure">{naira(clock.feeNgn)}</RText>
        </Animated.View>
      </View>
      <RText color={colors.muted} style={styles.note}>
        {clock.chargedMinutes} min · {naira(waiting.ngnPerMinute)}/min after {Math.round(waiting.freeSeconds / 60)} free
      </RText>
    </View>
  );
}

/** Once the trip started: what the waiting came to, in one quiet line. */
export function WaitingLine({ text }: { text: string }) {
  return (
    <View style={styles.line}>
      <RText style={styles.lineText}>{text}</RText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  top: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 },
  labelRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  label: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  figure: { fontSize: 21, lineHeight: 24, fontVariant: ["tabular-nums"] },
  note: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, fontVariant: ["tabular-nums"] },
  bar: { height: 6, borderRadius: 999, backgroundColor: colors.tint, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 999, backgroundColor: colors.ink },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.orange },
  line: { paddingHorizontal: 14, paddingVertical: 12, borderRadius: radius.md, backgroundColor: colors.tint },
  lineText: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19 },
});
