import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import Svg, { Line, Path, Polyline } from 'react-native-svg';

import { AppCard } from '@/components/app-card';
import { AppScreen } from '@/components/app-screen';
import { AppText } from '@/components/app-text';
import { useCachedQuery } from '@/lib/cached-query';
import { getDriverEarnings, type DriverEarningsResponse } from '@/lib/api';
import { useResponsive } from '@/lib/responsive';
import { useAppTheme } from '@/lib/theme-context';
import { theme } from '@/theme';

type Period = 'today' | 'week' | 'month';

const periods: { label: string; value: Period }[] = [
  { label: 'Today', value: 'today' },
  { label: 'This week', value: 'week' },
  { label: 'This month', value: 'month' },
];

function formatNgn(amount: number): string {
  return `NGN ${Math.round(amount).toLocaleString('en-NG')}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function BackIcon({ size = 22 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={theme.colors.black} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Line x1="19" y1="12" x2="5" y2="12" />
      <Polyline points="12 19 5 12 12 5" />
    </Svg>
  );
}

function EarningIcon({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={theme.colors.orange} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Line x1="12" y1="1" x2="12" y2="23" />
      <Path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </Svg>
  );
}

export default function DriverEarningsScreen() {
  const router = useRouter();
  const { isDark } = useAppTheme();
  const responsive = useResponsive();
  const [activePeriod, setActivePeriod] = useState<Period>('today');
  // Each period is its own copy: switching tabs shows the last figures at once.
  const earningsQuery = useCachedQuery<DriverEarningsResponse>({
    key: `earnings.${activePeriod}`,
    fetcher: (accessToken) => getDriverEarnings({ accessToken, period: activePeriod }),
  });
  const earnings = earningsQuery.data;
  const loading = earningsQuery.loading;
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await earningsQuery.refresh();
    setRefreshing(false);
  }, [earningsQuery]);

  const totalEarnings = earnings?.totalEarningsNgn ?? 0;
  const rideCount = earnings?.rideCount ?? 0;

  return (
    <AppScreen
      scroll
      contentStyle={[styles.container, { gap: responsive.scale(16) }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.colors.orange} colors={[theme.colors.orange]} />}>
      {/* Header with back */}
      <View style={[styles.header, { gap: responsive.scale(14) }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={[
            styles.backBtn,
            { width: responsive.scale(40), height: responsive.scale(40) },
            isDark && { backgroundColor: theme.colors.darkSurface },
          ]}>
          <BackIcon size={responsive.scale(22)} />
        </Pressable>
        <AppText variant="h1" numberOfLines={1}>Earnings</AppText>
      </View>

      {/* Period tab switcher (same style as History) */}
      <View style={[styles.tabs, isDark && { backgroundColor: theme.colors.darkSurface, borderColor: theme.colors.darkBorder }]}>
        {periods.map((p) => {
          const active = p.value === activePeriod;
          return (
            <Pressable
              key={p.value}
              onPress={() => setActivePeriod(p.value)}
              style={[styles.tab, { minHeight: responsive.scale(40) }, active && styles.tabActive]}
            >
              {/* Three labels across a 320pt phone: shrink the type, don't clip it. */}
              <AppText
                variant="label"
                color={active ? theme.colors.white : theme.colors.muted}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
                numberOfLines={1}
              >
                {p.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      {/* Summary card */}
      <View
        style={[
          styles.summaryCard,
          { paddingVertical: responsive.scale(20), paddingHorizontal: responsive.scale(16) },
          isDark && { backgroundColor: theme.colors.darkSurface },
        ]}>
        <View style={styles.summaryItem}>
          <AppText variant="bodySmall" color={theme.colors.muted} numberOfLines={1}>Total earned</AppText>
          {/* A month's total is far wider than "Rides" — shrink to fit its half. */}
          <AppText
            variant="h1"
            color={theme.colors.orange}
            adjustsFontSizeToFit
            minimumFontScale={0.55}
            numberOfLines={1}>
            {formatNgn(totalEarnings)}
          </AppText>
        </View>
        <View style={[styles.summaryDivider, { height: responsive.scale(36) }]} />
        <View style={styles.summaryItem}>
          <AppText variant="bodySmall" color={theme.colors.muted} numberOfLines={1}>Rides</AppText>
          <AppText variant="h1" adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={1}>
            {rideCount}
          </AppText>
        </View>
      </View>

      {/* Earnings list */}
      {loading ? (
        <View style={[styles.loaderWrap, { paddingVertical: responsive.vh(8, 32, 60) }]}>
          <ActivityIndicator size="large" color={theme.colors.orange} />
        </View>
      ) : earnings && earnings.items.length > 0 ? (
        <View style={styles.list}>
          {earnings.items.map((item) => (
            <AppCard key={item.id} style={styles.itemCard}>
              <View style={styles.itemRow}>
                <View
                  style={[
                    styles.itemIcon,
                    { width: responsive.scale(36), height: responsive.scale(36) },
                  ]}>
                  <EarningIcon size={responsive.scale(18)} />
                </View>
                <View style={styles.itemInfo}>
                  <AppText variant="bodyMedium" numberOfLines={1}>Ride payout</AppText>
                  <AppText variant="bodySmall" color={theme.colors.muted} numberOfLines={1}>
                    {formatDate(item.createdAt)}
                  </AppText>
                </View>
                <AppText variant="mono" color={theme.colors.orange} style={styles.itemAmount} numberOfLines={1}>
                  +{formatNgn(item.amountNgn)}
                </AppText>
              </View>
            </AppCard>
          ))}
        </View>
      ) : (
        <View style={[styles.emptyWrap, { paddingVertical: responsive.vh(6, 28, 48) }]}>
          <AppText variant="body" color={theme.colors.muted} style={styles.emptyText}>
            No earnings for this period yet. Complete rides to start earning.
          </AppText>
        </View>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: theme.spacing.lg,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    flexShrink: 0,
    borderRadius: theme.radii.xs,
    backgroundColor: theme.colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    ...theme.shadows.subtle,
  },

  // Tabs (matches History style)
  tabs: {
    flexDirection: 'row',
    backgroundColor: theme.colors.white,
    borderRadius: theme.radii.sm,
    padding: 4,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    ...theme.shadows.subtle,
  },
  tab: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xs,
    borderRadius: theme.radii.xs,
  },
  tabActive: {
    backgroundColor: theme.colors.orange,
  },

  // Summary
  summaryCard: {
    flexDirection: 'row',
    backgroundColor: theme.colors.white,
    borderRadius: theme.radii.md,
    alignItems: 'center',
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    ...theme.shadows.card,
  },
  summaryItem: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    paddingHorizontal: 2,
    gap: 4,
  },
  summaryDivider: {
    width: 1,
    backgroundColor: theme.colors.borderLight,
  },

  // List
  list: {
    gap: 10,
  },
  itemCard: {
    paddingVertical: 14,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  itemIcon: {
    flexShrink: 0,
    borderRadius: theme.radii.xs,
    backgroundColor: theme.colors.orangeLight,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.black,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  // The payout figure must never be truncated to fit the label beside it.
  itemAmount: {
    flexShrink: 0,
  },

  // Empty & loader
  loaderWrap: {
    alignItems: 'center',
  },
  emptyWrap: {
    alignItems: 'center',
  },
  emptyText: {
    textAlign: 'center',
    maxWidth: '70%',
  },
});
