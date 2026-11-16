import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Modal, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { RButton, RText, rider } from "@/components/rider/kit";
import { naira } from "@/constants/rider-theme";
import { minutesSeconds, waitingClock, waitingStage, type WaitingInfo } from "@/lib/waiting";

const { colors, fonts, radius } = rider;

/**
 * The driver is at the pickup: the free minutes count down; then (Timi, 16 Nov
 * 2026) the rider keeps the driver waiting at a price a minute both agree, or
 * cancels, and once agreed the fee ticks up from that moment, until the trip
 * starts. The same card as the WhatsApp ride page (widget/ride/ride.html #d-wait).
 * `onAnswer` opens the price sheet (WaitingDealSheet).
 */
export function WaitingCard({ waiting, onAnswer }: { waiting: WaitingInfo; onAnswer?: () => void }) {
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

  const deal = waiting.deal;
  if (!(waiting.ngnPerMinute > 0) && !deal) return null;
  const stage = waitingStage(waiting, now);

  if (stage === 'free') {
    const total = deal ? deal.baseFreeSeconds : waiting.freeSeconds;
    const end = waiting.stoppedAtMs ?? now + waiting.skewMs;
    const leftSeconds = Math.max(0, total - Math.floor((end - waiting.arrivedAtMs) / 1000));
    const left = total > 0 ? leftSeconds / total : 0;
    return (
      <View accessibilityLabel={`Free waiting, ${minutesSeconds(leftSeconds)} left`} accessible style={styles.card}>
        <View style={styles.top}>
          <RText color={colors.muted} style={styles.label}>Free waiting</RText>
          <RText style={styles.figure} variant="figure">{minutesSeconds(leftSeconds)}</RText>
        </View>
        <View style={styles.bar}>
          <View style={[styles.fill, { width: `${Math.round(left * 1000) / 10}%` }]} />
        </View>
        <RText color={colors.muted} style={styles.note}>
          {deal ? "Then agree a price, or cancel" : `Then ${naira(waiting.ngnPerMinute)}/min`}
        </RText>
      </View>
    );
  }

  if (stage === 'deal' && deal) {
    const offer = deal.offer;
    const note = !offer ? "Free waiting is over." : offer.by === "rider" ? "Waiting for your driver." : `Your driver asks ${naira(offer.ngn)}/min.`;
    return (
      <View style={styles.card}>
        <View accessibilityLabel={`Waiting price. ${note}`} accessible style={styles.top}>
          <RText color={colors.muted} style={styles.label}>Waiting price</RText>
          {offer ? <RText style={styles.figure} variant="figure">{naira(offer.ngn)}/min</RText> : null}
        </View>
        <RText color={colors.muted} style={styles.note}>{note}</RText>
        {onAnswer ? (
          <RButton
            onPress={onAnswer}
            size="md"
            style={styles.act}
            title={!offer ? "Keep driver waiting" : offer.by === "rider" ? "Change price" : "Answer"}
            variant="dark"
          />
        ) : null}
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
          {clock.stopped || !(waiting.ngnPerMinute > 0) ? null : <Animated.View style={[styles.dot, { opacity: pulse }]} />}
          <RText color={colors.muted} style={styles.label}>Waiting time</RText>
        </View>
        <Animated.View style={{ opacity: drop, transform: [{ translateY: drop.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }] }}>
          <RText color={colors.orangeText} style={styles.figure} variant="figure">{naira(clock.feeNgn)}</RText>
        </Animated.View>
      </View>
      <RText color={colors.muted} style={styles.note}>
        {deal
          ? `${clock.chargedMinutes} min · ${naira(waiting.ngnPerMinute)}/min`
          : `${clock.chargedMinutes} min · ${naira(waiting.ngnPerMinute)}/min after ${Math.round(waiting.freeSeconds / 60)} free`}
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

/**
 * Keep the driver waiting, or cancel (Timi, 16 Nov 2026): the seven prices a minute, the driver's own price to
 * accept when they asked one, and Cancel ride (the usual cancel, free). `waiting` null hides it.
 */
export function WaitingDealSheet({
  waiting,
  sending,
  error,
  onSend,
  onAccept,
  onCancelRide,
  onClose,
}: {
  waiting: WaitingInfo | null;
  sending: boolean;
  error: string | null;
  onSend: (ngn: number) => void;
  onAccept: (ngn: number) => void;
  onCancelRide: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const deal = waiting?.deal ?? null;
  const offer = deal?.offer ?? null;
  const ask = offer?.by === "driver" ? offer : null;
  const [pick, setPick] = useState<number | null>(null);
  const visible = Boolean(deal);
  // A fresh pick each time it opens: their own offer when they made one.
  useEffect(() => {
    if (visible) setPick(offer?.by === "rider" ? offer.ngn : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.backdrop}>
        <Pressable accessibilityLabel="Close" onPress={onClose} style={StyleSheet.absoluteFill} />
        <View accessibilityViewIsModal style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.grab} />
          <RText accessibilityRole="header" variant="heading">
            {ask ? `Your driver asks ${naira(ask.ngn)}/min` : `Your driver has waited ${Math.round((deal?.baseFreeSeconds ?? 300) / 60)} min`}
          </RText>
          <RText color={colors.muted} style={styles.sub}>
            {ask ? "Accept, or pick another price." : "Keep them waiting for a price a minute, or cancel. Nothing is charged until you both agree."}
          </RText>
          {ask ? <RButton disabled={sending} onPress={() => onAccept(ask.ngn)} title={`Accept ${naira(ask.ngn)}/min`} /> : null}
          <RText style={styles.caps}>PRICE A MINUTE</RText>
          <View accessibilityRole="radiogroup" style={styles.rates}>
            {(deal?.rates ?? []).map((n) => {
              const on = pick === n;
              return (
                <Pressable
                  accessibilityLabel={`${naira(n)} a minute`}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  key={n}
                  onPress={() => setPick(n)}
                  style={({ pressed }) => [styles.rate, on && styles.rateOn, pressed && styles.pressed]}>
                  <RText color={on ? colors.cream : colors.ink} style={styles.rateText}>{naira(n)}</RText>
                </Pressable>
              );
            })}
          </View>
          {error ? <RText accessibilityLiveRegion="polite" color={colors.danger} style={styles.note}>{error}</RText> : null}
          <RButton
            disabled={pick === null}
            loading={sending}
            onPress={() => pick !== null && onSend(pick)}
            title={pick === null ? "Pick a price" : `Send ${naira(pick)}/min`}
            variant={ask ? "ghost" : "dark"}
          />
          <Pressable accessibilityRole="button" onPress={onCancelRide} style={styles.cancel}>
            <RText color={colors.danger} style={styles.cancelText}>Cancel ride</RText>
          </Pressable>
        </View>
      </View>
    </Modal>
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
  act: { alignSelf: "flex-start", marginTop: 2 },
  backdrop: { flex: 1, backgroundColor: "rgba(13,13,13,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.cream, borderTopLeftRadius: rider.radius.sheet, borderTopRightRadius: rider.radius.sheet, paddingHorizontal: rider.gutter, paddingTop: 12, gap: 14 },
  grab: { alignSelf: "center", width: 40, height: 5, borderRadius: 999, backgroundColor: "#B8AE9E", marginBottom: 4 },
  sub: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, marginTop: -6 },
  caps: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 17, letterSpacing: 0.5 },
  rates: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  rate: { width: "23%", flexGrow: 1, height: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, alignItems: "center", justifyContent: "center" },
  rateOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  rateText: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 20, fontVariant: ["tabular-nums"] },
  pressed: { opacity: 0.72 },
  cancel: { alignSelf: "center", minHeight: 44, justifyContent: "center", paddingHorizontal: 16 },
  cancelText: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 20 },
});
