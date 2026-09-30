import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Linking, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import type { ReactNode } from 'react';

import { AppScreen } from '@/components/app-screen';
import { AppText } from '@/components/app-text';
import { BackIcon, CopyIcon, ngnText, shortKey, transferLabel, transferStatus, useCopy, whenText, xlmText } from '@/components/stellar-bits';
import { getStellarMe, type StellarMeResponse } from '@/lib/api';
import { useCachedQuery } from '@/lib/cached-query';
import { useAppTheme } from '@/lib/theme-context';
import { theme } from '@/theme';

/**
 * One Stellar transfer, opened from the activity list: what it was, how much
 * (and its naira worth at the rate it used), its status and why, the
 * addresses and the transaction, each copyable, and the explorer.
 */
export default function DriverStellarTransferScreen() {
  const router = useRouter();
  const { isDark } = useAppTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const me = useCachedQuery<StellarMeResponse>({
    key: 'stellar.me',
    fetcher: (accessToken) => getStellarMe({ accessToken }),
    staleMs: 20_000,
  });
  const { copied, copy } = useCopy();
  const t = (me.data?.transfers ?? []).find((x) => x.id === id) ?? null;
  const mine = me.data?.account?.publicKey ?? null;
  const surface: ViewStyle | null = isDark ? { backgroundColor: theme.colors.darkSurface, borderColor: theme.colors.darkBorder } : null;

  const copyRow = (label: string, value: string, shown: string) => (
    <Pressable onPress={() => void copy(value, label)} style={styles.row} accessibilityLabel={`Copy ${label}`}>
      <AppText variant="bodySmall" color={theme.colors.muted} style={styles.rowLabel}>{label}</AppText>
      <AppText variant="mono" style={styles.rowValue} numberOfLines={1}>{shown}</AppText>
      <View style={[styles.copyBtn, copied === label && styles.copyBtnWide]}>
        {copied === label ? <AppText variant="bodySmall" color={theme.colors.orange}>Copied</AppText> : <CopyIcon size={14} />}
      </View>
    </Pressable>
  );

  const header = (
    <View style={styles.header}>
      <Pressable onPress={() => router.back()} hitSlop={12} style={[styles.backBtn, surface]} accessibilityLabel="Back">
        <BackIcon />
      </Pressable>
      <AppText variant="h1" numberOfLines={1} style={styles.flex}>{t ? transferLabel(t).title : 'Transfer'}</AppText>
    </View>
  );

  if (!t) {
    return (
      <AppScreen scroll contentStyle={styles.container}>
        {header}
        {me.loading ? <ActivityIndicator color={theme.colors.orange} /> : (
          <AppText variant="body" color={theme.colors.muted}>This transfer is no longer in your recent activity.</AppText>
        )}
      </AppScreen>
    );
  }

  const incoming = t.direction === 'in';
  const status = transferStatus(t);
  const { icon } = transferLabel(t);
  const other = incoming ? t.from : t.to;

  return (
    <AppScreen scroll contentStyle={styles.container}>
      {header}

      {/* ── Amount ── */}
      <View style={styles.amountCard}>
        <View style={styles.rowBetween}>
          <View style={styles.bigIcon}>
            <MaterialIcons name={icon} size={20} color={theme.colors.offWhite} />
          </View>
          <View style={[styles.statusTag, { borderColor: status.color }]}>
            <View style={[styles.statusDot, { backgroundColor: status.color }]} />
            <AppText variant="bodySmall" color={status.color}>{status.label}</AppText>
          </View>
        </View>
        <AppText variant="display" color={theme.colors.offWhite} adjustsFontSizeToFit minimumFontScale={0.6} numberOfLines={1}
          style={t.status === 'SKIPPED' || t.status === 'FAILED' ? styles.struck : null}>
          {incoming ? '+' : '-'}{xlmText(t.amountXlm, 7)} XLM
        </AppText>
        {t.amountNgn ? (
          <AppText variant="bodySmall" color="#9C948D">
            ≈ {ngnText(t.amountNgn)}{t.rateNgnPerXlm ? ` at ₦${t.rateNgnPerXlm.toLocaleString('en-NG', { maximumFractionDigits: 2 })} per XLM` : ''}
          </AppText>
        ) : null}
        <AppText variant="bodySmall" color="#9C948D">{whenText(t.createdAt)}</AppText>
      </View>

      {/* ── Why it did not go ── */}
      {t.note && t.status !== 'CONFIRMED' ? (
        <View style={[styles.noteCard, t.status === 'SKIPPED' || t.status === 'FAILED' ? styles.noteBad : styles.noteWait]}>
          <AppText variant="bodyMedium">{t.status === 'SKIPPED' ? 'Why it was skipped' : t.status === 'FAILED' ? 'Why it failed' : 'Waiting'}</AppText>
          <AppText variant="bodySmall" color={theme.colors.muted}>{t.note}</AppText>
          {t.status === 'SKIPPED' ? (
            <AppText variant="bodySmall" color={theme.colors.muted}>The trip itself was paid as normal; only its Stellar copy was skipped.</AppText>
          ) : null}
        </View>
      ) : null}

      {/* ── Details ── */}
      <View style={[styles.card, surface]}>
        {t.memo && (t.kind === 'FARE' || t.kind === 'COMMISSION') ? (
          <>{copyRow('Trip ID', t.memo, t.memo)}<Divider /></>
        ) : null}
        {other ? <>{copyRow(incoming ? 'From' : 'To', other, shortKey(other, 7))}<Divider /></> : null}
        {mine ? <>{copyRow(incoming ? 'To (you)' : 'From (you)', mine, shortKey(mine, 7))}<Divider /></> : null}
        <Row label="Network"><AppText variant="bodyMedium" style={styles.rowValue}>Stellar Testnet</AppText></Row>
        <Divider />
        <Row label="Network fee"><AppText variant="bodyMedium" style={styles.rowValue}>Paid by Wheelers</AppText></Row>
        {t.txHash ? <><Divider />{copyRow('Transaction', t.txHash, shortKey(t.txHash, 7))}</> : null}
      </View>

      {t.explorerUrl ? (
        <Pressable onPress={() => void Linking.openURL(t.explorerUrl!)} style={({ pressed }) => [styles.explorerBtn, pressed && styles.btnPressed]}>
          <MaterialIcons name="open-in-new" size={18} color={theme.colors.white} />
          <AppText variant="label" color={theme.colors.white}>View on stellar.expert</AppText>
        </Pressable>
      ) : null}
      <AppText variant="bodySmall" color={theme.colors.muted} style={styles.center}>Test XLM on the Stellar test network. No real value.</AppText>
    </AppScreen>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.row}>
      <AppText variant="bodySmall" color={theme.colors.muted} style={styles.rowLabel}>{label}</AppText>
      {children}
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  container: { paddingTop: theme.spacing.lg, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 4 },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: theme.radii.xs,
    backgroundColor: theme.colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    ...theme.shadows.subtle,
  },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  amountCard: {
    backgroundColor: theme.colors.black,
    borderRadius: theme.radii.lg,
    padding: 24,
    gap: 6,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    ...theme.shadows.card,
  },
  bigIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.darkSurfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  statusTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: theme.radii.pill,
    borderWidth: theme.borders.regular,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  struck: { textDecorationLine: 'line-through' },
  noteCard: { borderRadius: theme.radii.md, borderWidth: theme.borders.regular, padding: 16, gap: 4 },
  noteBad: { backgroundColor: theme.colors.dangerLight, borderColor: theme.colors.danger },
  noteWait: { backgroundColor: theme.colors.orangeLight, borderColor: theme.colors.orange },
  card: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.radii.md,
    paddingHorizontal: 20,
    paddingVertical: 6,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    ...theme.shadows.card,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, paddingVertical: 14 },
  rowLabel: { flexShrink: 0 },
  rowValue: { flex: 1, textAlign: 'right' },
  divider: { height: 1, backgroundColor: theme.colors.borderLight },
  copyBtn: {
    flexShrink: 0,
    minWidth: 30,
    height: 30,
    borderRadius: theme.radii.xs,
    backgroundColor: theme.colors.orangeLight,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.black,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyBtnWide: { paddingHorizontal: theme.spacing.sm },
  explorerBtn: {
    flexDirection: 'row',
    gap: 8,
    height: 52,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.black,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    ...theme.shadows.card,
  },
  btnPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
});
