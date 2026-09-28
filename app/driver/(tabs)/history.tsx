import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { AppCard } from '@/components/app-card';
import { AppText } from '@/components/app-text';
import { DriverBidsList } from '@/components/driver-bids-list';
import { useCachedQuery } from '@/lib/cached-query';
import {
  getDriverBids,
  getDriverRideHistory,
  getWalletTransactions,
  type DriverBidRecord,
  type DriverHistoryRide,
  type WalletTransaction,
} from '@/lib/api';
import { useResponsive } from '@/lib/responsive';
import { useAppTheme } from '@/lib/theme-context';
import { theme } from '@/theme';

type Tab = 'rides' | 'bids' | 'transactions';

type RideFilter = 'all' | 'completed' | 'cancelled';

const RIDE_FILTERS: { key: RideFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
];

function matchesRideFilter(status: string, filter: RideFilter): boolean {
  if (filter === 'completed') return status === 'COMPLETED';
  if (filter === 'cancelled') return status === 'CANCELLED';
  return true;
}

function isTab(value: unknown): value is Tab {
  return value === 'rides' || value === 'bids' || value === 'transactions';
}

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

function statusColor(status: string): string {
  switch (status) {
    case 'COMPLETED':
      return theme.colors.green;
    case 'CANCELLED':
      return theme.colors.danger;
    case 'IN_PROGRESS':
    case 'DRIVER_EN_ROUTE':
    case 'ARRIVED':
      return theme.colors.orange;
    default:
      return theme.colors.muted;
  }
}

export default function DriverHistoryScreen() {
  const { isDark } = useAppTheme();
  const responsive = useResponsive();
  // `?tab=bids` deep-links straight to the bids list (from the home card).
  const params = useLocalSearchParams<{ tab?: string | string[] }>();
  const requestedTab = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const [activeTab, setActiveTab] = useState<Tab>(isTab(requestedTab) ? requestedTab : 'rides');
  useEffect(() => {
    if (isTab(requestedTab)) setActiveTab(requestedTab);
  }, [requestedTab]);
  const [rideFilter, setRideFilter] = useState<RideFilter>('all');
  // Shown at once from the last copy; fetched again after a minute, and when a trip ends.
  const ridesQuery = useCachedQuery<DriverHistoryRide[]>({
    key: 'driver-history.rides',
    fetcher: (accessToken) => getDriverRideHistory({ accessToken, limit: 30 }).then((r) => r.items),
  });
  const txnsQuery = useCachedQuery<WalletTransaction[]>({
    key: 'wallet.transactions',
    fetcher: (accessToken) => getWalletTransactions({ accessToken, limit: 30 }).then((r) => r.items),
  });
  // Bids are best-effort: an older backend without the route must not blank the rest.
  const bidsQuery = useCachedQuery<DriverBidRecord[]>({
    key: 'driver-history.bids',
    fetcher: (accessToken) => getDriverBids({ accessToken, limit: 50 }).then((r) => r.items).catch(() => [] as DriverBidRecord[]),
  });
  const rides = ridesQuery.data ?? [];
  const transactions = txnsQuery.data ?? [];
  const bids = bidsQuery.data ?? [];
  const loadingRides = ridesQuery.loading;
  const loadingTxns = txnsQuery.loading;
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([ridesQuery.refresh(), txnsQuery.refresh(), bidsQuery.refresh()]);
    setRefreshing(false);
  }, [ridesQuery, txnsQuery, bidsQuery]);

  const loading = activeTab === 'transactions' ? loadingTxns : loadingRides;
  const filteredRides = rides.filter((ride) => matchesRideFilter(ride.status, rideFilter));

  return (
    <AppScreen
      scroll
      // The tab bar owns the bottom inset; claiming it again would leave a gap.
      safeAreaEdges={['top', 'left', 'right']}
      contentStyle={[styles.container, { gap: responsive.scale(16) }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.colors.orange} colors={[theme.colors.orange]} />}>
      <AppText variant="h1" numberOfLines={1}>History</AppText>

      {/* Tab switcher */}
      <View style={[styles.tabs, isDark && { backgroundColor: theme.colors.darkSurface, borderColor: theme.colors.darkBorder }]}>
        <Pressable
          onPress={() => setActiveTab('rides')}
          style={[styles.tab, { minHeight: responsive.scale(40) }, activeTab === 'rides' && styles.tabActive]}
        >
          <AppText
            variant="label"
            color={activeTab === 'rides' ? theme.colors.white : theme.colors.muted}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
            numberOfLines={1}
          >
            Rides
          </AppText>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab('bids')}
          style={[styles.tab, { minHeight: responsive.scale(40) }, activeTab === 'bids' && styles.tabActive]}
        >
          <AppText
            variant="label"
            color={activeTab === 'bids' ? theme.colors.white : theme.colors.muted}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
            numberOfLines={1}
          >
            Bids
          </AppText>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab('transactions')}
          style={[styles.tab, { minHeight: responsive.scale(40) }, activeTab === 'transactions' && styles.tabActive]}
        >
          <AppText
            variant="label"
            color={activeTab === 'transactions' ? theme.colors.white : theme.colors.muted}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
            numberOfLines={1}
          >
            Transactions
          </AppText>
        </Pressable>
      </View>

      {loading ? (
        <View style={[styles.loaderWrap, { paddingVertical: responsive.vh(8, 32, 60) }]}>
          <ActivityIndicator size="large" color={theme.colors.orange} />
        </View>
      ) : activeTab === 'bids' ? (
        <DriverBidsList history={bids} />
      ) : activeTab === 'rides' ? (
        <View style={styles.list}>
          <View style={styles.filterRow}>
            {RIDE_FILTERS.map((f) => {
              const selected = rideFilter === f.key;
              return (
                <Pressable
                  key={f.key}
                  onPress={() => setRideFilter(f.key)}
                  style={[
                    styles.filterChip,
                    isDark && { backgroundColor: theme.colors.darkSurface, borderColor: theme.colors.darkBorder },
                    selected && styles.filterChipActive,
                  ]}>
                  <AppText
                    variant="caption"
                    color={selected ? theme.colors.white : theme.colors.muted}
                    numberOfLines={1}>
                    {f.label}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
          {filteredRides.length === 0 ? (
            <View style={[styles.emptyWrap, { paddingVertical: responsive.vh(6, 28, 48) }]}>
              <AppText variant="body" color={theme.colors.muted} style={styles.emptyText}>
                {rides.length === 0
                  ? 'No rides yet. Go online to start accepting ride requests.'
                  : `No ${rideFilter} rides in your recent history.`}
              </AppText>
            </View>
          ) : (
            filteredRides.map((ride) => {
              const fare = ride.fareFinalNgn ?? ride.fareEstimateNgn;
              const date = ride.completedAt ?? ride.cancelledAt ?? ride.createdAt;
              return (
                <AppCard key={ride.id} style={styles.rideCard}>
                  <View style={styles.rideTop}>
                    <View style={styles.rideInfo}>
                      <AppText variant="bodyMedium" numberOfLines={1}>
                        {ride.pickupAddress}
                      </AppText>
                      <AppText variant="bodySmall" color={theme.colors.muted} numberOfLines={1}>
                        to {ride.destAddress}
                      </AppText>
                    </View>
                    <AppText
                      variant="mono"
                      color={ride.status === 'COMPLETED' ? theme.colors.green : theme.colors.muted}
                      style={styles.rowAmount}
                      numberOfLines={1}
                    >
                      {formatNgn(fare)}
                    </AppText>
                  </View>
                  <View style={styles.rideBottom}>
                    <AppText variant="bodySmall" color={theme.colors.muted} numberOfLines={1}>
                      {ride.tripId ? `${ride.tripId} · ${formatDate(date)}` : formatDate(date)}
                    </AppText>
                    <View
                      style={[styles.dot, { backgroundColor: statusColor(ride.status) }]}
                    />
                    <AppText variant="bodySmall" color={statusColor(ride.status)} numberOfLines={1}>
                      {ride.status.replace(/_/g, ' ')}
                    </AppText>
                  </View>
                </AppCard>
              );
            })
          )}
        </View>
      ) : transactions.length === 0 ? (
        <View style={[styles.emptyWrap, { paddingVertical: responsive.vh(6, 28, 48) }]}>
          <AppText variant="body" color={theme.colors.muted} style={styles.emptyText}>
            No transactions yet.
          </AppText>
        </View>
      ) : (
        <View style={styles.list}>
          {transactions.map((entry) => {
            const isCredit = entry.direction === 'CREDIT';
            return (
              <AppCard key={entry.id} style={styles.txnCard}>
                <View style={styles.txnRow}>
                  <View
                    style={[
                      styles.txnIcon,
                      { width: responsive.scale(36), height: responsive.scale(36) },
                      isCredit ? styles.txnIconCredit : styles.txnIconDebit,
                    ]}>
                    <AppText variant="label" color={isCredit ? theme.colors.green : theme.colors.danger}>
                      {isCredit ? '+' : '-'}
                    </AppText>
                  </View>
                  <View style={styles.txnInfo}>
                    <AppText variant="bodyMedium" numberOfLines={2}>
                      {entry.type.replace(/_/g, ' ')}
                    </AppText>
                    <AppText variant="bodySmall" color={theme.colors.muted} numberOfLines={1}>
                      {formatDate(entry.createdAt)}
                    </AppText>
                  </View>
                  <AppText
                    variant="mono"
                    color={isCredit ? theme.colors.green : theme.colors.danger}
                    style={styles.rowAmount}
                    numberOfLines={1}
                  >
                    {isCredit ? '+' : '-'}{formatNgn(Math.abs(entry.amountNgn))}
                  </AppText>
                </View>
              </AppCard>
            );
          })}
        </View>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: theme.spacing.lg,
  },

  // Tabs
  filterRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  filterChip: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 6,
    borderRadius: theme.radii.pill,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.white,
  },
  filterChipActive: {
    backgroundColor: theme.colors.black,
    borderColor: theme.colors.black,
  },
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

  // Loader & empty
  loaderWrap: {
    alignItems: 'center',
  },
  emptyWrap: {
    alignItems: 'center',
  },
  emptyText: {
    textAlign: 'center',
    // Percentage rather than a fixed 240pt so the copy stays a comfortable
    // measure on a 320pt phone and on a tablet alike.
    maxWidth: '70%',
  },

  // List
  list: {
    gap: 10,
  },

  // Ride card
  rideCard: {
    gap: 10,
  },
  rideTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  rideInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  // Amounts must never be truncated to make room for the label beside them.
  rowAmount: {
    flexShrink: 0,
  },
  rideBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  // Transaction card
  txnCard: {
    paddingVertical: 14,
  },
  txnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  txnIcon: {
    flexShrink: 0,
    borderRadius: theme.radii.xs,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.black,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txnIconCredit: {
    backgroundColor: theme.colors.successLight,
  },
  txnIconDebit: {
    backgroundColor: theme.colors.dangerLight,
  },
  txnInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
});
