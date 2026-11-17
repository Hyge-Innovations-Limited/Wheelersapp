import { type Href, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { RButton, RText, rider } from "@/components/rider/kit";
import { naira } from "@/constants/rider-theme";
import { getAccessTokenWithRetry } from "@/lib/access-token";
import { answerGroupCounter, answerGroupOffer } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { groupOfferTitle, groupStep, type GroupCounterAsk, type GroupOfferView } from "@/lib/group-offer";

const { colors, fonts, radius } = rider;

/**
 * A group ride question over the search (Timi, 16-17 Nov 2026), the same as the ride page's: the offer (riders going the
 * same way, the seat 25% off, 20 s: Ride together or No thanks), the selfie a yes needs (once, reused), or a driver's
 * price over this rider's seat (Yes or No in 20 s; silence is No). One sheet: the price question first, never two at
 * once (iOS shows one). An expired question closes by itself. It steps aside while another screen (the camera) is open.
 * What happened (formed, someone left, not this time) is said by GroupNoteBanner, not here.
 */
export function GroupOfferSheet({
  rideId,
  offer,
  counter,
  focused,
}: {
  rideId: string | null;
  offer: GroupOfferView | null | undefined;
  counter: GroupCounterAsk | null | undefined;
  focused: boolean;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { getAccessToken } = useAuth();
  const [now, setNow] = useState(Date.now());
  const [sending, setSending] = useState<"join" | "decline" | "yes" | "no" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState<{ offerId: string; answer: "join" | "decline"; selfieNeeded: boolean } | null>(null);
  const [said, setSaid] = useState<{ askId: string; answer: "yes" | "no" } | null>(null);
  const [closedKey, setClosedKey] = useState<string | null>(null);

  const ticking = Boolean(offer || counter);
  useEffect(() => {
    if (!ticking) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [ticking]);

  const answered = offer && mine?.offerId === offer.offerId ? { ...offer, answer: mine.answer, selfieNeeded: offer.answer ? offer.selfieNeeded : mine.selfieNeeded } : offer;
  const step = answered ? groupStep(answered) : null;
  const offerLeftS = offer ? Math.max(0, Math.round((offer.expiresAtMs - now) / 1000)) : 0;
  const selfieLeftS = offer ? Math.max(0, Math.round((offer.selfieDeadlineMs - now) / 1000)) : 0;
  const counterSaid = counter && said?.askId === counter.askId ? said.answer : counter?.answer ?? null;
  const counterLeftS = counter ? Math.max(0, Math.round((counter.expiresAtMs - now) / 1000)) : 0;
  const askingPrice = Boolean(counter) && counterSaid !== "no" && counterLeftS > 0;
  const offerKey = offer ? `offer:${offer.offerId}` : null;

  // An offer nobody answered: "Time's up", then it goes by itself (a lost update never leaves it on screen).
  const expiredUnanswered = Boolean(offer) && step === "ask" && offerLeftS === 0;
  useEffect(() => {
    if (!expiredUnanswered || !offerKey) return;
    const timer = setTimeout(() => setClosedKey(offerKey), 2000);
    return () => clearTimeout(timer);
  }, [expiredUnanswered, offerKey]);

  const showOffer = Boolean(offer) && closedKey !== offerKey && !(step === "selfie" && selfieLeftS === 0);
  const visible = focused && (askingPrice || showOffer);

  async function answer(choice: "join" | "decline") {
    if (!offer || !rideId || sending) return;
    setSending(choice);
    setError(null);
    try {
      const token = await getAccessTokenWithRetry(getAccessToken);
      if (!token) throw new Error("Please sign in again.");
      const result = await answerGroupOffer(token, rideId, choice);
      setMine({ offerId: offer.offerId, answer: choice, selfieNeeded: result.selfieNeeded === true });
      if (choice === "join" && result.selfieNeeded) router.push("/group-ride/live-selfie" as Href);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not send that. Try again.");
    } finally {
      setSending(null);
    }
  }

  async function answerPrice(choice: "yes" | "no") {
    if (!counter || !rideId || sending) return;
    setSending(choice);
    setError(null);
    try {
      const token = await getAccessTokenWithRetry(getAccessToken);
      if (!token) throw new Error("Please sign in again.");
      await answerGroupCounter(token, rideId, choice, counter.askId);
      setSaid({ askId: counter.askId, answer: choice });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not send that. Try again.");
    } finally {
      setSending(null);
    }
  }

  const timer = (leftS: number) => (
    <>
      <View style={styles.top}>
        <RText style={styles.caps}>GROUP RIDE</RText>
        <RText accessibilityLabel={leftS > 0 ? `${leftS} seconds left` : "Time's up"} color={colors.muted} style={styles.small}>
          {leftS > 0 ? `0:${String(leftS).padStart(2, "0")}` : "Time's up"}
        </RText>
      </View>
      <View style={styles.timer}><View style={[styles.timerFill, { width: `${Math.round((leftS / 20) * 100)}%` }]} /></View>
    </>
  );

  return (
    <Modal animationType="slide" onRequestClose={() => (askingPrice ? undefined : setClosedKey(offerKey))} transparent visible={visible}>
      <View style={styles.backdrop}>
        <View accessibilityViewIsModal style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.grab} />
          {askingPrice && counter ? (
            <>
              {timer(counterLeftS)}
              <RText accessibilityRole="header" variant="heading">{`A driver asks ${naira(counter.askNgn)} for your seat`}</RText>
              <RText color={colors.muted} style={styles.sub}>{counterSaid === "yes" ? "Waiting for the others." : `Your seat was ${naira(counter.seatPriceNgn)}.`}</RText>
              {error ? <RText accessibilityLiveRegion="polite" color={colors.danger} style={styles.small}>{error}</RText> : null}
              <View style={styles.row}>
                <RButton disabled={counterSaid === "yes"} loading={sending === "no"} onPress={() => void answerPrice("no")} size="md" style={styles.half} title="No" variant="ghost" />
                <RButton disabled={counterSaid === "yes"} loading={sending === "yes"} onPress={() => void answerPrice("yes")} size="md" style={styles.half} title={`Yes, ${naira(counter.askNgn)}`} />
              </View>
            </>
          ) : answered && step === "ask" ? (
            <>
              {timer(offerLeftS)}
              <RText accessibilityRole="header" variant="heading">{groupOfferTitle(answered)}</RText>
              <View style={styles.road}>
                {answered.riders.map((r, i) => (
                  <View key={`${r.name}-${i}`} style={styles.stop}>
                    <View style={[styles.dot, r.you && styles.dotYou]} />
                    <View style={styles.stopText}>
                      <RText style={styles.stopName}>{r.name}</RText>
                      {r.pickup ? <RText color={colors.muted} style={styles.small}>{r.pickup}</RText> : null}
                    </View>
                  </View>
                ))}
                {answered.dropoff ? (
                  <View style={styles.stop}>
                    <View style={[styles.dot, styles.dotEnd]} />
                    <RText style={styles.stopName}>{answered.dropoff}</RText>
                  </View>
                ) : null}
              </View>
              <View style={styles.deal}>
                <View>
                  <RText color={colors.onInkMuted} style={styles.small}>Ride together</RText>
                  <RText style={styles.seat}>{naira(answered.seatPriceNgn)}</RText>
                </View>
                <View style={styles.was}>
                  <RText color={colors.onInkMuted} style={[styles.small, styles.strike]}>{naira(answered.ownPriceNgn)}</RText>
                  <View style={styles.save}><RText style={styles.saveText}>{`Save ${naira(answered.savedNgn)}`}</RText></View>
                </View>
              </View>
              <RText color={colors.muted} style={styles.small}>{`About ${answered.extraMinutes} min more · ${answered.people} in the car · Faces checked`}</RText>
              {error ? <RText accessibilityLiveRegion="polite" color={colors.danger} style={styles.small}>{error}</RText> : null}
              <View style={styles.row}>
                <RButton disabled={offerLeftS === 0} loading={sending === "decline"} onPress={() => void answer("decline")} size="md" style={styles.half} title="No thanks" variant="ghost" />
                <RButton disabled={offerLeftS === 0} loading={sending === "join"} onPress={() => void answer("join")} size="md" style={styles.half} title="Ride together" />
              </View>
            </>
          ) : answered && step === "selfie" ? (
            <>
              <RText accessibilityRole="header" variant="heading">One selfie for group rides</RText>
              <RText color={colors.muted} style={styles.sub}>{"Wheelers checks it's you. You only do this once."}</RText>
              <RText accessibilityLabel={`${selfieLeftS} seconds left`} color={colors.muted} style={styles.small}>{`${selfieLeftS} s left`}</RText>
              <RButton onPress={() => router.push("/group-ride/live-selfie" as Href)} title="Take a selfie" variant="dark" />
            </>
          ) : answered ? (
            <>
              <RText accessibilityRole="header" variant="heading">{step === "declined" ? "No problem" : "Getting your group together"}</RText>
              <RText color={colors.muted} style={styles.sub}>{step === "declined" ? "Your own search goes on." : "We'll tell you in a moment."}</RText>
            </>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

/**
 * What happened to the group (formed, someone left, a price declined, not this time), in the server's words, said
 * once as a short banner over the search (the ride page's toast): never a sheet in the way.
 */
export function GroupNoteBanner({ note }: { note: string | null | undefined }) {
  const insets = useSafeAreaInsets();
  const [shown, setShown] = useState<string | null>(null);
  useEffect(() => {
    if (!note) return;
    setShown(note);
    const timer = setTimeout(() => setShown(null), 6000);
    return () => clearTimeout(timer);
  }, [note]);
  if (!shown) return null;
  return (
    <Pressable accessibilityLiveRegion="polite" accessibilityRole="text" onPress={() => setShown(null)} style={[styles.banner, { top: insets.top + 8 }]}>
      <RText color={colors.cream} style={styles.bannerText}>{shown}</RText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(13,13,13,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.cream, borderTopLeftRadius: rider.radius.sheet, borderTopRightRadius: rider.radius.sheet, paddingHorizontal: rider.gutter, paddingTop: 12, gap: 14 },
  grab: { alignSelf: "center", width: 40, height: 5, borderRadius: 999, backgroundColor: "#B8AE9E", marginBottom: 4 },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  caps: { fontFamily: fonts.bold, fontSize: 12, lineHeight: 16, letterSpacing: 0.6, color: colors.muted },
  small: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  sub: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, marginTop: -6 },
  timer: { height: 4, borderRadius: 999, backgroundColor: colors.tint, overflow: "hidden", marginTop: -6 },
  timerFill: { height: "100%", backgroundColor: colors.orange },
  road: { gap: 10, paddingLeft: 4 },
  stop: { flexDirection: "row", alignItems: "center", gap: 12 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 3, borderColor: colors.ink, backgroundColor: colors.cream },
  dotYou: { backgroundColor: colors.orange },
  dotEnd: { borderRadius: 2, backgroundColor: colors.ink },
  stopText: { flex: 1 },
  stopName: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 19 },
  deal: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", padding: 16, borderRadius: radius.lg, backgroundColor: colors.ink },
  seat: { fontFamily: fonts.display, fontSize: 32, lineHeight: 36, color: colors.orange, fontVariant: ["tabular-nums"] },
  was: { alignItems: "flex-end", gap: 4 },
  strike: { textDecorationLine: "line-through" },
  save: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.green },
  saveText: { fontFamily: fonts.bold, fontSize: 12, lineHeight: 16, color: "#FFFFFF" },
  row: { flexDirection: "row", gap: 10 },
  half: { flex: 1 },
  banner: { position: "absolute", left: rider.gutter, right: rider.gutter, zIndex: 20, padding: 14, borderRadius: radius.lg, backgroundColor: colors.ink },
  bannerText: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 19 },
});
