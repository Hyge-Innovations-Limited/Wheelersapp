import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppText, OnLight } from '@/components/app-text';
import { waitingStage, type WaitingInfo } from '@/lib/waiting';
import { theme } from '@/theme';

const naira = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`;

/**
 * The waiting price on the driver's side (Timi, 16 Nov 2026). After the free
 * minutes the rider offers a price a minute to keep the driver waiting; the
 * driver accepts it or counters with another. Nothing is charged until one
 * side takes the other's price. Under the wait timer on the Arrived screen.
 */
export function DriverWaitingDeal({
  waiting,
  nowMs,
  onAnswer,
}: {
  waiting: WaitingInfo;
  nowMs: number;
  onAnswer: (action: 'offer' | 'accept', ngn: number) => Promise<void>;
}) {
  const [countering, setCountering] = useState(false);
  const [pick, setPick] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deal = waiting.deal;
  if (!deal) return null;

  if (deal.rateNgn !== null) {
    return (
      <View style={styles.line}>
        <OnLight>
          <AppText variant="bodySmall">{naira(deal.rateNgn)}/min agreed. Waiting time counts from then.</AppText>
        </OnLight>
      </View>
    );
  }
  if (waitingStage(waiting, nowMs) !== 'deal') return null;

  const offer = deal.offer;
  if (!offer || offer.by === 'driver') {
    return (
      <View style={styles.line}>
        <OnLight>
          <AppText variant="bodySmall" color={theme.colors.muted}>
            {offer ? `You asked ${naira(offer.ngn)}/min. Waiting for the rider.` : "Free waiting is over. Waiting for the rider's price."}
          </AppText>
        </OnLight>
      </View>
    );
  }

  const send = async (action: 'offer' | 'accept', ngn: number) => {
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      await onAnswer(action, ngn);
      setCountering(false);
      setPick(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not send that. Try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <View accessibilityLiveRegion="polite" style={styles.card}>
      <OnLight>
        <AppText variant="h3">Rider offers {naira(offer.ngn)}/min</AppText>
        <AppText variant="bodySmall" color={theme.colors.muted}>To keep you waiting. Nothing is charged until you agree.</AppText>
      </OnLight>
      {countering ? (
        <>
          <View accessibilityRole="radiogroup" style={styles.rates}>
            {deal.rates.map((n) => {
              const on = pick === n;
              return (
                <Pressable
                  accessibilityLabel={`${naira(n)} a minute`}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  key={n}
                  onPress={() => setPick(n)}
                  style={({ pressed }) => [styles.rate, on && styles.rateOn, pressed && styles.pressed]}>
                  <OnLight>
                    <AppText variant="label" color={on ? theme.colors.white : theme.colors.black}>{naira(n)}</AppText>
                  </OnLight>
                </Pressable>
              );
            })}
          </View>
          <AppButton
            disabled={pick === null}
            loading={sending}
            onPress={() => pick !== null && void send('offer', pick)}
            title={pick === null ? 'Pick a price' : `Ask ${naira(pick)}/min`}
          />
          <Pressable accessibilityRole="button" onPress={() => setCountering(false)} style={styles.link}>
            <OnLight><AppText variant="bodySmall" color={theme.colors.muted}>Back</AppText></OnLight>
          </Pressable>
        </>
      ) : (
        <View style={styles.row}>
          <View style={styles.half}>
            <AppButton loading={sending} onPress={() => void send('accept', offer.ngn)} title={`Accept ${naira(offer.ngn)}`} />
          </View>
          <View style={styles.half}>
            <AppButton disabled={sending || deal.offersLeft <= 0} onPress={() => { setError(null); setCountering(true); }} title="Counter" variant="ghost" />
          </View>
        </View>
      )}
      {error ? (
        <OnLight><AppText variant="bodySmall" color={theme.colors.danger}>{error}</AppText></OnLight>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12, padding: 16, borderRadius: 18, backgroundColor: theme.colors.white, borderWidth: 1, borderColor: theme.colors.borderLight },
  line: { paddingHorizontal: 14, paddingVertical: 12, borderRadius: 16, backgroundColor: '#F3ECDC' },
  row: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
  rates: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  rate: { width: '23%', flexGrow: 1, height: 46, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.borderLight, backgroundColor: theme.colors.offWhite, alignItems: 'center', justifyContent: 'center' },
  rateOn: { backgroundColor: theme.colors.black, borderColor: theme.colors.black },
  pressed: { opacity: 0.72 },
  link: { alignSelf: 'center', minHeight: 40, justifyContent: 'center', paddingHorizontal: 16 },
});
