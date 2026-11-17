import { type Href, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { RButton, RText, rider } from "@/components/rider/kit";
import { naira } from "@/constants/rider-theme";
import { getAccessTokenWithRetry } from "@/lib/access-token";
import { answerGroupOffer } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formedLine, groupOfferTitle, groupStep, type GroupFormed, type GroupOfferView } from "@/lib/group-offer";

const { colors, fonts, radius } = rider;

/**
 * A group ride offer over the search (Timi, 16-17 Nov 2026), the same as the ride page's: riders going the same way,
 * the seat 25% off, 20 s to say Ride together or No thanks. A yes with no selfie opens the selfie screen (once, reused).
 * Then "Getting your group together"; and how it ended (formed, or not, for a yes).
 */
export function GroupOfferSheet({
  rideId,
  offer,
  formed,
  note,
}: {
  rideId: string | null;
  offer: GroupOfferView | null | undefined;
  formed: GroupFormed | null | undefined;
  note: string | null | undefined;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { getAccessToken } = useAuth();
  const [now, setNow] = useState(Date.now());
  const [sending, setSending] = useState<"join" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState<{ offerId: string; answer: "join" | "decline"; selfieNeeded: boolean } | null>(null);
  const [closedKey, setClosedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!offer) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [offer]);

  const outcome = formed ? `formed:${formed.seatPriceNgn}:${formed.others.join(",")}` : note ? `note:${note}` : null;
  const showing = offer ? `offer:${offer.offerId}` : outcome;
  const visible = Boolean(showing) && closedKey !== showing;

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

  const answered = offer && mine?.offerId === offer.offerId ? { ...offer, answer: mine.answer, selfieNeeded: offer.answer ? offer.selfieNeeded : mine.selfieNeeded } : offer;
  const step = answered ? groupStep(answered) : null;
  const leftS = offer ? Math.max(0, Math.round((offer.expiresAtMs - now) / 1000)) : 0;

  return (
    <Modal animationType="slide" onRequestClose={() => setClosedKey(showing)} transparent visible={visible}>
      <View style={styles.backdrop}>
        <Pressable accessibilityLabel="Close" onPress={() => offer ? undefined : setClosedKey(showing)} style={StyleSheet.absoluteFill} />
        <View accessibilityViewIsModal style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.grab} />
          {answered && step === "ask" ? (
            <>
              <View style={styles.top}>
                <RText style={styles.caps}>GROUP RIDE</RText>
                <RText color={colors.muted} style={styles.small}>{`0:${String(leftS).padStart(2, "0")}`}</RText>
              </View>
              <View style={styles.timer}><View style={[styles.timerFill, { width: `${Math.round((leftS / 20) * 100)}%` }]} /></View>
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
                <RButton disabled={leftS === 0} loading={sending === "decline"} onPress={() => void answer("decline")} size="md" style={styles.half} title="No thanks" variant="ghost" />
                <RButton disabled={leftS === 0} loading={sending === "join"} onPress={() => void answer("join")} size="md" style={styles.half} title="Ride together" />
              </View>
            </>
          ) : answered && step === "selfie" ? (
            <>
              <RText accessibilityRole="header" variant="heading">One selfie for group rides</RText>
              <RText color={colors.muted} style={styles.sub}>The riders in your group see it. You see theirs. You only do this once.</RText>
              <RButton onPress={() => router.push("/group-ride/live-selfie" as Href)} title="Take a selfie" variant="dark" />
            </>
          ) : answered ? (
            <>
              <RText accessibilityRole="header" variant="heading">{step === "declined" ? "No problem" : "Getting your group together"}</RText>
              <RText color={colors.muted} style={styles.sub}>{step === "declined" ? "Your own search goes on." : "We'll tell you in a moment."}</RText>
            </>
          ) : (
            <>
              <RText accessibilityRole="header" variant="heading">{formed ? "Riding together" : "No group this time"}</RText>
              <RText color={colors.muted} style={styles.sub}>{formed ? formedLine(formed, naira) : "Your search goes on."}</RText>
              <RButton onPress={() => setClosedKey(showing)} title="OK" />
            </>
          )}
        </View>
      </View>
    </Modal>
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
});
