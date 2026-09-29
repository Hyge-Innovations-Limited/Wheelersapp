import { Href, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { ActivityIndicator, Platform, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Path, Polyline } from 'react-native-svg';

import { AppScreen } from '@/components/app-screen';
import { AppText } from '@/components/app-text';
import {
  getDriverEarnings,
  provisionVirtualAccount,
  type DriverEarningsResponse,
  type ProvisionVirtualAccountResponse, getStellarMe, type StellarMeResponse } from '@/lib/api';
import { useResponsive } from '@/lib/responsive';
import { useAppTheme } from '@/lib/theme-context';
import { invalidateWalletCache, useWalletOverview } from '@/lib/wallet-overview';
import { useCachedQuery } from '@/lib/cached-query';
import { theme } from '@/theme';

function formatNgn(amount: number): string {
  return `NGN ${Math.round(amount).toLocaleString('en-NG')}`;
}

// ── Icons ──────────────────────────────────────────────

function EyeIcon({ open, size = 20 }: { open: boolean; size?: number }) {
  const c = '#9C948D';
  if (open) {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <Circle cx="12" cy="12" r="3" />
      </Svg>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <Path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <Line x1="1" y1="1" x2="23" y2="23" />
    </Svg>
  );
}

function CopyIcon({ size = 16 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={theme.colors.orange} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <Path d="M15 2H9a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1z" />
    </Svg>
  );
}

function ArrowUpIcon({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={theme.colors.white} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <Line x1="12" y1="19" x2="12" y2="5" />
      <Polyline points="5 12 12 5 19 12" />
    </Svg>
  );
}

// ── Component ──────────────────────────────────────────

export default function DriverWalletTabScreen() {
  const router = useRouter();
  const { isDark } = useAppTheme();
  const responsive = useResponsive();
  const { overview } = useWalletOverview();
  const [balanceVisible, setBalanceVisible] = useState(true);
  // Today's earnings: shown at once from the last copy, fetched again after a minute.
  const earningsQuery = useCachedQuery<DriverEarningsResponse>({
    key: 'earnings.today',
    fetcher: (accessToken) => getDriverEarnings({ accessToken, period: 'today' }),
    staleMs: 60_000,
  });
  // The driver's own deposit account never changes once opened: kept in secure
  // storage and checked once a day, not asked for on every visit.
  const accountQuery = useCachedQuery<ProvisionVirtualAccountResponse>({
    key: 'wallet.deposit-account',
    fetcher: (accessToken) => provisionVirtualAccount({ accessToken }),
    staleMs: 24 * 60 * 60 * 1000,
    storage: 'secure',
  });
  // Stellar Testnet: the card shows only when the server has it switched on.
  const stellar = useCachedQuery<StellarMeResponse>({
    key: 'stellar.me',
    fetcher: (accessToken) => getStellarMe({ accessToken }),
    staleMs: 60_000,
  });
  const earnings = earningsQuery.data;
  const loadingEarnings = earningsQuery.loading;
  const account = accountQuery.data;
  const loadingAccount = accountQuery.loading;
  const accountError = account ? null : accountQuery.error && 'Account not found. Pull to refresh to try again.';
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    // The balance card reads the cached overview — a pull-to-refresh that
    // skipped it left stale money on screen after a withdrawal.
    invalidateWalletCache();
    await Promise.all([earningsQuery.refresh(), accountQuery.refresh()]);
    setRefreshing(false);
  }, [earningsQuery, accountQuery]);

  const balanceNgn = overview?.balanceNgn ?? 0;
  const lockedNgn = overview?.lockedNgn ?? 0;
  const totalEarnings = earnings?.totalEarningsNgn ?? 0;
  const rideCount = earnings?.rideCount ?? 0;

  const handleCopy = async () => {
    if (!account) return;
    await Clipboard.setStringAsync(account.accountNumber);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <AppScreen
      scroll
      // The tab bar already reserves the bottom inset — claiming it here too
      // would leave a dead strip above it on gesture-nav phones.
      safeAreaEdges={['top', 'left', 'right']}
      contentStyle={[styles.container, { gap: responsive.scale(16) }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.colors.orange} colors={[theme.colors.orange]} />}>
      {/* ── Balance card ── */}
      <View style={[styles.balanceCard, { padding: responsive.scale(24) }]}>
        <View style={styles.balanceHeader}>
          <AppText variant="bodySmall" color="#9C948D" numberOfLines={1}>Available balance</AppText>
          <Pressable onPress={() => setBalanceVisible(!balanceVisible)} hitSlop={12}>
            <EyeIcon open={balanceVisible} size={responsive.scale(18)} />
          </Pressable>
        </View>
        {/* Balances run to seven figures — shrink the digits rather than clip them. */}
        <AppText
          variant="display"
          color={theme.colors.offWhite}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
          numberOfLines={1}>
          {balanceVisible ? formatNgn(balanceNgn) : 'NGN ****'}
        </AppText>
        {lockedNgn > 0 && (
          <AppText variant="bodySmall" color="#9C948D" numberOfLines={1}>
            Locked: {balanceVisible ? formatNgn(lockedNgn) : '****'}
          </AppText>
        )}
      </View>

      {/* ── Virtual account (fund wallet) ── */}
      <View
        style={[
          styles.accountCard,
          { padding: responsive.scale(18) },
          isDark && { backgroundColor: theme.colors.darkSurface },
        ]}>
        <AppText
          variant="label"
          color={theme.colors.muted}
          style={[styles.accountLabel, { fontSize: responsive.font(10) }]}
          numberOfLines={1}>
          Fund your wallet
        </AppText>
        {loadingAccount ? (
          <ActivityIndicator size="small" color={theme.colors.orange} style={{ paddingVertical: 12 }} />
        ) : account ? (
          <>
            <View style={[styles.accountRow, { gap: responsive.scale(12) }]}>
              <View style={styles.accountInfo}>
                <AppText variant="h2" adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={1}>
                  {account.accountNumber}
                </AppText>
                <AppText variant="bodySmall" color={theme.colors.muted} numberOfLines={2}>
                  {account.bankName} — {account.accountName}
                </AppText>
              </View>
              <Pressable
                onPress={handleCopy}
                style={[
                  styles.copyBtn,
                  { width: responsive.scale(40), height: responsive.scale(40) },
                  copied && styles.copyBtnWide,
                ]}
                hitSlop={8}>
                {copied ? (
                  <AppText variant="bodySmall" color={theme.colors.orange} numberOfLines={1}>Copied</AppText>
                ) : (
                  <CopyIcon size={responsive.scale(16)} />
                )}
              </Pressable>
            </View>
            <AppText variant="bodySmall" color={theme.colors.muted}>
              Transfer to this account to top up your wallet
            </AppText>
          </>
        ) : (
          <AppText variant="bodySmall" color={theme.colors.muted} style={{ paddingVertical: 8 }}>
            {accountError ?? 'Could not load account details — pull to refresh to try again.'}
          </AppText>
        )}
      </View>

      {/* ── Withdraw button ── */}
      <Pressable
        style={({ pressed }) => [
          styles.withdrawBtn,
          { minHeight: responsive.scale(52) },
          pressed && styles.btnPressed,
        ]}
        onPress={() => router.push('/driver/withdraw' as Href)}
      >
        <ArrowUpIcon size={responsive.scale(18)} />
        <AppText variant="label" color={theme.colors.white} numberOfLines={1}>Withdraw</AppText>
      </Pressable>

      {/* ── Stellar Testnet (grant demo): only when the server has it on ── */}
      {stellar.data?.enabled ? (
        <Pressable
          onPress={() => router.push('/driver/stellar' as Href)}
          style={({ pressed }) => [
            styles.earningsCard,
            { padding: responsive.scale(16), gap: responsive.scale(8) },
            isDark && { backgroundColor: theme.colors.darkSurface },
            pressed && styles.btnPressed,
          ]}>
          <View style={styles.earningsLeft}>
            <AppText variant="bodySmall" color={theme.colors.muted} numberOfLines={1}>Stellar Testnet</AppText>
            <AppText variant="h3" numberOfLines={1}>
              {stellar.data.account?.balanceXlm ? `${Number(stellar.data.account.balanceXlm).toLocaleString('en-NG', { maximumFractionDigits: 2 })} XLM` : 'Opens with your first paid trip'}
            </AppText>
          </View>
          <AppText variant="h3" color={theme.colors.orange}>›</AppText>
        </Pressable>
      ) : null}

      {/* ── Earnings quick card ── */}
      <Pressable
        onPress={() => router.push('/driver/earnings' as Href)}
        style={({ pressed }) => [
          styles.earningsCard,
          { padding: responsive.scale(20), gap: responsive.scale(12) },
          isDark && { backgroundColor: theme.colors.darkSurface },
          pressed && styles.btnPressed,
        ]}
      >
        <View style={styles.earningsLeft}>
          <AppText variant="bodySmall" color={theme.colors.muted} numberOfLines={1}>
            {loadingEarnings ? 'Loading...' : `Today's earnings`}
          </AppText>
          <AppText
            variant="h1"
            color={theme.colors.orange}
            adjustsFontSizeToFit
            minimumFontScale={0.65}
            numberOfLines={1}>
            {loadingEarnings ? '--' : formatNgn(totalEarnings)}
          </AppText>
          <AppText variant="bodySmall" color={theme.colors.muted} numberOfLines={1}>
            {loadingEarnings ? '' : `${rideCount} ride${rideCount !== 1 ? 's' : ''}`}
          </AppText>
        </View>
        <View
          style={[
            styles.earningsArrow,
            { width: responsive.scale(36), height: responsive.scale(36) },
          ]}>
          <Svg width={responsive.scale(20)} height={responsive.scale(20)} viewBox="0 0 24 24" fill="none" stroke={theme.colors.muted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Polyline points="9 18 15 12 9 6" />
          </Svg>
        </View>
      </Pressable>
    </AppScreen>
  );
}

// ── Styles ──────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    paddingTop: theme.spacing.lg,
  },

  // Balance card
  balanceCard: {
    backgroundColor: theme.colors.black,
    borderRadius: theme.radii.lg,
    gap: 6,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    ...theme.shadows.card,
  },
  balanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: 4,
  },

  // Virtual account
  accountCard: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.radii.md,
    gap: 8,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    ...theme.shadows.card,
  },
  accountLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontSize: 10,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  accountInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  copyBtn: {
    flexShrink: 0,
    borderRadius: theme.radii.xs,
    backgroundColor: theme.colors.orangeLight,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.black,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // "Copied" is wider than the icon it replaces — let the box grow for it.
  copyBtnWide: {
    width: 'auto',
    paddingHorizontal: theme.spacing.sm,
  },

  // Withdraw
  withdrawBtn: {
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
  btnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },

  // Earnings card
  earningsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.white,
    borderRadius: theme.radii.md,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    ...theme.shadows.card,
  },
  earningsLeft: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  earningsArrow: {
    flexShrink: 0,
    borderRadius: theme.radii.xs,
    backgroundColor: theme.colors.offWhite,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.black,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
