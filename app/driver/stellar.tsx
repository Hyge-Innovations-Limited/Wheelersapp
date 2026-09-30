import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Href, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { AppText } from '@/components/app-text';
import {
  ArrowUpIcon, BackIcon, ChevronRightIcon, CopyIcon, EyeIcon,
  ngnText, shortKey, transferLabel, transferStatus, useCopy, xlmText,
} from '@/components/stellar-bits';
import { getStellarMe, type StellarMeResponse } from '@/lib/api';
import { useCachedQuery } from '@/lib/cached-query';
import { useResponsive } from '@/lib/responsive';
import { useAppTheme } from '@/lib/theme-context';
import { theme } from '@/theme';

/**
 * The driver's Stellar TESTNET account (grant demo), laid out like the Wallet
 * tab: the balance in test XLM with its naira equivalent, the address to
 * copy, Send, and the activity (each opens its own page). Test XLM has no
 * real value. Only public addresses are ever shown.
 */
export default function DriverStellarScreen() {
  const router = useRouter();
  const { isDark } = useAppTheme();
  const responsive = useResponsive();
  const me = useCachedQuery<StellarMeResponse>({
    key: 'stellar.me',
    fetcher: (accessToken) => getStellarMe({ accessToken }),
    staleMs: 20_000,
  });
  const { copied, copy } = useCopy();
  const [visible, setVisible] = useState(true);

  const data = me.data;
  const account = data?.account ?? null;
  const transfers = data?.transfers ?? [];
  const balance = account?.balanceXlm == null ? null : Number(account.balanceXlm);
  const surface = isDark ? { backgroundColor: theme.colors.darkSurface } : null;

  return (
    <AppScreen
      scroll
      contentStyle={[styles.container, { gap: responsive.scale(16) }]}
      refreshControl={<RefreshControl refreshing={me.refreshing} onRefresh={() => void me.refresh()} tintColor={theme.colors.orange} colors={[theme.colors.orange]} />}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={[styles.backBtn, surface]} accessibilityLabel="Back">
          <BackIcon />
        </Pressable>
        <AppText variant="h1" numberOfLines={1} style={styles.flex}>Stellar</AppText>
        <View style={styles.tag}>
          <View style={styles.tagDot} />
          <AppText variant="bodySmall" color={theme.colors.green}>Testnet</AppText>
        </View>
      </View>

      {me.loading && !data ? <ActivityIndicator color={theme.colors.orange} style={styles.loading} /> : null}

      {data && !data.enabled ? (
        <View style={[styles.card, { padding: responsive.scale(18) }, surface]}>
          <AppText variant="bodyMedium">Stellar Testnet is not switched on right now.</AppText>
        </View>
      ) : null}

      {data?.enabled ? (
        <>
          {/* ── Balance card ── */}
          <View style={[styles.balanceCard, { padding: responsive.scale(24) }]}>
            <View style={styles.rowBetween}>
              <AppText variant="bodySmall" color="#9C948D" numberOfLines={1}>Stellar balance</AppText>
              <Pressable onPress={() => setVisible(!visible)} hitSlop={12}>
                <EyeIcon open={visible} size={responsive.scale(18)} />
              </Pressable>
            </View>
            <AppText variant="display" color={theme.colors.offWhite} adjustsFontSizeToFit minimumFontScale={0.6} numberOfLines={1}>
              {balance === null ? 'XLM —' : visible ? `XLM ${xlmText(balance)}` : 'XLM ****'}
            </AppText>
            <AppText variant="bodySmall" color="#9C948D" numberOfLines={2}>
              {!account?.opened
                ? 'Your account is being opened with 100 test XLM. Pull down to refresh.'
                : account.balanceNgnEquivalent != null && visible
                  ? `≈ ${ngnText(account.balanceNgnEquivalent)} today. Test XLM, not your wallet.`
                  : 'Test XLM, not your wallet.'}
            </AppText>
          </View>

          {/* ── Address card ── */}
          {account ? (
            <View style={[styles.card, { padding: responsive.scale(18) }, surface]}>
              <AppText variant="label" color={theme.colors.muted} style={styles.overline} numberOfLines={1}>
                Your Stellar address
              </AppText>
              <View style={styles.rowBetween}>
                <View style={styles.flexShrink}>
                  <AppText variant="h2" adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={1}>
                    {shortKey(account.publicKey, 8)}
                  </AppText>
                </View>
                <Pressable
                  onPress={() => void copy(account.publicKey)}
                  style={[styles.copyBtn, { minWidth: responsive.scale(40), height: responsive.scale(40) }, copied && styles.copyBtnWide]}
                  hitSlop={8}
                  accessibilityLabel={copied ? 'Copied' : 'Copy address'}>
                  {copied ? (
                    <AppText variant="bodySmall" color={theme.colors.orange} numberOfLines={1}>Copied</AppText>
                  ) : (
                    <CopyIcon size={responsive.scale(16)} />
                  )}
                </Pressable>
              </View>
              <Pressable onPress={() => void Linking.openURL(account.explorerUrl)} hitSlop={6} style={styles.linkRow}>
                <AppText variant="bodySmall" color={theme.colors.muted}>Stellar Testnet ·</AppText>
                <AppText variant="bodySmall" color={theme.colors.orange}>View on stellar.expert</AppText>
              </Pressable>
            </View>
          ) : null}

          {/* ── Send ── */}
          <Pressable
            disabled={!account?.opened}
            onPress={() => router.push('/driver/stellar-send' as Href)}
            style={({ pressed }) => [styles.sendBtn, { minHeight: responsive.scale(52) }, pressed && styles.btnPressed, !account?.opened && styles.off]}>
            <ArrowUpIcon size={responsive.scale(18)} />
            <AppText variant="label" color={theme.colors.white} numberOfLines={1}>Send XLM</AppText>
          </Pressable>

          {/* ── Activity ── */}
          <View style={[styles.card, { padding: responsive.scale(18) }, surface]}>
            <AppText variant="h3">Activity</AppText>
            {transfers.length === 0 ? (
              <AppText variant="bodySmall" color={theme.colors.muted}>Nothing yet. Your trip payments show here.</AppText>
            ) : null}
            {transfers.map((t, index) => {
              const { title, icon } = transferLabel(t);
              const status = transferStatus(t);
              const incoming = t.direction === 'in';
              const settled = t.status === 'CONFIRMED';
              return (
                <Pressable
                  key={t.id ?? `${t.createdAt}-${index}`}
                  disabled={!t.id}
                  onPress={() => t.id && router.push({ pathname: '/driver/stellar-transfer', params: { id: t.id } } as never)}
                  style={({ pressed }) => [styles.activityRow, index < transfers.length - 1 && styles.divider, pressed && styles.rowPressed]}>
                  <View style={[styles.activityIcon, incoming ? styles.iconIn : styles.iconOut]}>
                    <MaterialIcons name={icon} size={18} color={incoming ? theme.colors.green : theme.colors.black} />
                  </View>
                  <View style={styles.activityCopy}>
                    <AppText variant="bodyMedium" numberOfLines={1}>{title}</AppText>
                    <AppText variant="bodySmall" color={settled ? theme.colors.muted : status.color} numberOfLines={1}>
                      {settled
                        ? new Date(t.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                        : status.label}
                    </AppText>
                  </View>
                  <AppText
                    variant="mono"
                    numberOfLines={1}
                    style={styles.amount}
                    color={!settled ? theme.colors.mutedLight : incoming ? theme.colors.green : theme.colors.danger}>
                    {incoming ? '+' : '-'}{xlmText(t.amountXlm)}
                  </AppText>
                  <ChevronRightIcon size={16} />
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexShrink: { flex: 1, minWidth: 0 },
  container: { paddingTop: theme.spacing.lg },
  loading: { marginTop: theme.spacing.xl },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
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
  tag: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: theme.radii.pill,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.green,
    backgroundColor: theme.colors.successLight,
  },
  tagDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.green },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.md },

  balanceCard: {
    backgroundColor: theme.colors.black,
    borderRadius: theme.radii.lg,
    gap: 6,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    ...theme.shadows.card,
  },
  card: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.radii.md,
    gap: 8,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    ...theme.shadows.card,
  },
  overline: { textTransform: 'uppercase', letterSpacing: 0.5, fontSize: 10 },
  copyBtn: {
    flexShrink: 0,
    borderRadius: theme.radii.xs,
    backgroundColor: theme.colors.orangeLight,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.black,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // "Copied" is wider than the icon it replaces: the box grows for it.
  copyBtnWide: { paddingHorizontal: theme.spacing.sm },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },

  sendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.orange,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    ...theme.shadows.card,
  },
  btnPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  off: { opacity: 0.5 },

  activityRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, paddingVertical: theme.spacing.sm },
  rowPressed: { opacity: 0.6 },
  divider: { borderBottomWidth: 1, borderBottomColor: '#EEE0D4' },
  activityIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  iconIn: { backgroundColor: theme.colors.successLight },
  iconOut: { backgroundColor: '#F5F2ED' },
  activityCopy: { flex: 1, minWidth: 0, gap: 2 },
  // The amount is never truncated to fit the label beside it.
  amount: { flexShrink: 0 },
});
