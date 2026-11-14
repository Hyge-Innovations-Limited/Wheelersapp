import { useEffect, useRef } from 'react';
import { Animated, Modal, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { RButton, RText, rider } from '@/components/rider/kit';
import { MicIcon, ShieldIcon, WheelersMark } from '@/components/security-icons';
import { CHECK_WORDS, checkDate, type DriverCheck } from '@/lib/rider-safety';

const { colors, fonts } = rider;

/**
 * Rider safety sheets (Timi, 14 Nov 2026), the same as the ride page's:
 *   "Before you get in" (three tips) while the driver comes,
 *   "Trip started" with "This trip is recorded for your safety." when it is,
 *   "Before you go" (three tips) after the trip.
 */
export function SafetySheet({
  title,
  tips,
  recorded,
  button,
  onClose,
}: {
  /** Null hides the sheet. */
  title: string | null;
  tips?: string[];
  recorded?: boolean;
  button: string;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={title !== null}>
      <View style={styles.backdrop}>
        <View accessibilityViewIsModal style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.grab} />
          <View style={styles.head}>
            <ShieldIcon size={22} />
            <RText accessibilityRole="header" style={styles.headText} variant="heading">{title ?? ''}</RText>
          </View>
          {recorded ? <RecordedLine /> : null}
          {tips && tips.length > 0 ? (
            <View style={styles.list}>
              {tips.map((tip, i) => (
                <View key={tip} style={[styles.tip, i > 0 && styles.divider]}>
                  <View style={styles.num}><RText style={styles.numText}>{String(i + 1)}</RText></View>
                  <RText style={styles.tipText}>{tip}</RText>
                </View>
              ))}
            </View>
          ) : null}
          <RButton onPress={onClose} title={button} />
        </View>
      </View>
    </Modal>
  );
}

/** A red dot that breathes, and the line. */
export function RecordedLine() {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.25, duration: 800, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <View accessibilityLabel="This trip is recorded for your safety." accessible style={styles.rec}>
      <Animated.View style={{ opacity: pulse }}><MicIcon size={16} /></Animated.View>
      <RText style={styles.recText}>This trip is recorded for your safety.</RText>
    </View>
  );
}

function Tick({ size = 13, color = colors.green }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** The ✓ chips on an offer: only what passed and is in date (the server leaves the rest out). */
export function CheckChips({ checks }: { checks: DriverCheck[] }) {
  return (
    <View style={styles.chips}>
      <View style={styles.shield}><ShieldIcon size={18} /></View>
      {checks.map((c) => (
        <View key={c.kind} style={styles.chip}>
          <Tick />
          <RText style={styles.chipText}>{CHECK_WORDS[c.kind].chip}</RText>
        </View>
      ))}
    </View>
  );
}

/** "Checked by Wheelers": each check in words, with its month (insurance with its end). */
export function ChecksSheet({ checks, onClose }: { checks: DriverCheck[] | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={checks !== null}>
      <View style={styles.backdrop}>
        <View accessibilityViewIsModal style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.grab} />
          <View style={styles.head}>
            <WheelersMark size={28} />
            <RText accessibilityRole="header" style={styles.headText} variant="heading">Checked by Wheelers</RText>
          </View>
          <View style={styles.list}>
            {(checks ?? []).map((c, i) => (
              <View key={c.kind} style={[styles.checkRow, i > 0 && styles.divider]}>
                <View style={styles.ok}><Tick size={15} /></View>
                <RText style={styles.checkLine}>{CHECK_WORDS[c.kind].line}</RText>
                <RText color={colors.muted} style={styles.checkDate}>{checkDate(c)}</RText>
              </View>
            ))}
          </View>
          <RButton onPress={onClose} title="Close" />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(13,13,13,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.cream,
    borderTopLeftRadius: rider.radius.sheet,
    borderTopRightRadius: rider.radius.sheet,
    paddingHorizontal: rider.gutter,
    paddingTop: 12,
    gap: 14,
  },
  grab: { alignSelf: 'center', width: 40, height: 5, borderRadius: 999, backgroundColor: '#B8AE9E', marginBottom: 4 },
  list: { borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, overflow: 'hidden' },
  divider: { borderTopWidth: 1, borderTopColor: colors.line },
  tip: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  num: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  numText: { fontFamily: fonts.displayBold, fontSize: 13, lineHeight: 16, color: colors.orange },
  tipText: { flex: 1, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  rec: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 14, backgroundColor: colors.tint },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headText: { flexShrink: 1 },
  shield: { height: 24, justifyContent: 'center' },
  recText: { flex: 1, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 24, paddingLeft: 6, paddingRight: 8, borderRadius: 999, backgroundColor: colors.greenSoft },
  chipText: { fontFamily: fonts.bold, fontSize: 12, lineHeight: 16, color: colors.green },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  ok: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center' },
  checkLine: { flex: 1, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  checkDate: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 16, fontVariant: ['tabular-nums'] },
});
