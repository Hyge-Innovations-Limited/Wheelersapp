import { Href, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppCard } from '@/components/app-card';
import { AppScreen } from '@/components/app-screen';
import { AppText, OnLight } from '@/components/app-text';
import { MapMock } from '@/components/MapMock';
import { MetricCard } from '@/components/MetricCard';
import { SectionHeader } from '@/components/SectionHeader';
import { StatusPill } from '@/components/StatusPill';
import { SkeletonCard, SkeletonLine, SkeletonMetricRow } from '@/components/SkeletonLoader';
import { useAuth } from '@/lib/auth';
import { getAccessTokenWithRetry } from '@/lib/access-token';
import { checkPapersGate, PAPERS_GATE_BODY, PAPERS_GATE_TITLE } from '@/lib/papers-gate';
import { getDriverPapers, getDriverStats, getDriverEarnings, type DriverStatsResponse } from '@/lib/api';
import { useDriverSession } from '@/lib/driver-session';
import { useAppLocation } from '@/lib/location';
import { useAppNotifications } from '@/lib/notifications';
import { useResponsive } from '@/lib/responsive';
import { askMicrophoneOnce } from '@/lib/trip-recorder';
import { useWalletOverview } from '@/lib/wallet-overview';
import { theme } from '@/theme';

function formatNgn(amount: number): string {
  return `₦${Math.round(amount).toLocaleString('en-NG')}`;
}

export default function DriverDashboardScreen() {
  const router = useRouter();
  const { getAccessToken } = useAuth();
  const { session, goOnline, goOffline, connectionState } = useDriverSession();
  const { overview } = useWalletOverview();
  const { permissionState, requestLocationAccess, requestBackgroundLocationAccess, currentLocation } =
    useAppLocation();
  const { permissionGranted, requestNotificationAccess } = useAppNotifications();
  const responsive = useResponsive();
  const notificationPromptedRef = useRef(false);
  const notificationAskRef = useRef<Promise<unknown> | null>(null);
  const micAskedRef = useRef(false);

  const [stats, setStats] = useState<DriverStatsResponse | null>(null);
  const [todayEarnings, setTodayEarnings] = useState<number>(0);
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  useEffect(() => {
    if (permissionState !== 'idle') return;
    void requestLocationAccess();
  }, [permissionState, requestLocationAccess]);

  useEffect(() => {
    if (notificationPromptedRef.current || permissionGranted) return;
    // One consent conversation at a time: wait until the LOCATION flow has
    // settled (granted or declined) before opening the notifications ask —
    // both used to fire on mount and stack their dialogs on top of each other.
    if (permissionState === 'idle') return;
    notificationPromptedRef.current = true;
    notificationAskRef.current = Promise.resolve(requestNotificationAccess()).catch(() => undefined);
  }, [permissionGranted, permissionState, requestNotificationAccess]);

  // Then the microphone, for trip recording: once the notifications ask has
  // closed, and only when this driver's trips are recorded.
  useEffect(() => {
    if (micAskedRef.current || permissionState === 'idle') return;
    if (!permissionGranted && !notificationPromptedRef.current) return;
    micAskedRef.current = true;
    void (async () => {
      await notificationAskRef.current;
      await askMicrophoneOnce({
        getAccessToken: () => getAccessTokenWithRetry(getAccessToken),
        explain: () =>
          new Promise<boolean>((resolve) =>
            Alert.alert(
              'Trips are recorded',
              'For safety, Wheelers records the sound of each trip. Only Wheelers support can listen. Recordings are deleted after 30 days. You can turn this off in Settings.',
              [{ text: 'Continue', onPress: () => resolve(true) }],
              { cancelable: false },
            ),
          ),
      });
    })().catch(() => undefined);
  }, [permissionGranted, permissionState, getAccessToken]);

  useEffect(() => {
    void (async () => {
      try {
        const accessToken = await getAccessTokenWithRetry(getAccessToken);
        if (!accessToken) return;
        const [driverStats, earnings] = await Promise.all([
          getDriverStats({ accessToken }),
          getDriverEarnings({ accessToken, period: 'today' }),
        ]);
        setStats(driverStats);
        setTodayEarnings(earnings.totalEarningsNgn);
      } catch {
        // stats will remain null — non-blocking
      } finally {
        setIsLoadingStats(false);
      }
    })();
  }, [getAccessToken]);

  useEffect(() => {
    if (session.status === 'offered' && session.currentOffer) {
      router.push('/driver/incoming-request' as Href);
    }
  }, [session.status, session.currentOffer, router]);

  const isOnline = session.status !== 'offline';
  const statusLabel = isOnline ? 'Online' : 'Offline';
  const statusVariant = isOnline ? 'green' as const : 'outline' as const;
  const balanceNgn = overview?.balanceNgn ?? stats?.balanceNgn ?? 0;

  const togglingRef = useRef(false);
  const handleToggleOnline = async () => {
    if (togglingRef.current) return;
    togglingRef.current = true;
    try {
      if (isOnline) {
        await goOffline();
      } else {
        console.log('[dashboard] going online, currentLocation:', currentLocation);
        if (!currentLocation) {
          console.warn('[dashboard] no location available');
          return;
        }
        const gate = await checkPapersGate({
          getToken: () => getAccessTokenWithRetry(getAccessToken),
          fetchPapers: getDriverPapers,
        });
        if (!gate.ok) {
          // A warning, not a block: Send papers, or Go online anyway.
          const goAnyway = await new Promise<boolean>((resolve) => {
            Alert.alert(PAPERS_GATE_TITLE, PAPERS_GATE_BODY, [
              { text: 'Send papers', onPress: () => { router.push('/driver/docs' as Href); resolve(false); } },
              { text: 'Go online', onPress: () => resolve(true) },
            ], { cancelable: true, onDismiss: () => resolve(false) });
          });
          if (!goAnyway) return;
        }
        await requestBackgroundLocationAccess();
        await goOnline(currentLocation.lat, currentLocation.lng);
      }
    } finally {
      togglingRef.current = false;
    }
  };

  return (
    <AppScreen backgroundColor={theme.colors.offWhite} scroll contentStyle={styles.container}>
      <StatusBar style="dark" backgroundColor={theme.colors.offWhite} />
      <View style={styles.topRow}>
        <SectionHeader
          subtitle={isOnline ? 'Ready to pick up nearby riders' : 'Go online to start accepting rides'}
          title={isOnline ? 'Online' : 'Offline'}
        />
        <StatusPill label={statusLabel} variant={statusVariant} />
      </View>

      {isLoadingStats && !stats ? (
        <SkeletonMetricRow count={3} />
      ) : (
        <View style={styles.metricsRow}>
          <MetricCard
            accent="orange"
            backgroundColor={theme.colors.orangeLight}
            label="Today"
            value={formatNgn(todayEarnings)}
          />
          <MetricCard
            accent="black"
            backgroundColor={theme.colors.white}
            label="Rating"
            value={stats ? stats.rating.toFixed(1) : '--'}
          />
          <MetricCard
            accent="black"
            backgroundColor={theme.colors.white}
            label="Rides"
            value={stats ? String(stats.totalRides) : '--'}
          />
        </View>
      )}

      {/* Accountability starts as a number on your own profile before it is
          ever a policy: how often trips you took ended cancelled. */}
      {stats?.cancellationRate !== undefined && (stats.completedRides ?? 0) + (stats.cancelledRides ?? 0) > 0 ? (
        <AppText variant="bodySmall" color={stats.cancellationRate > 0.2 ? theme.colors.danger : theme.colors.muted} style={styles.reliabilityLine}>
          Reliability: {Math.round((1 - stats.cancellationRate) * 100)}% of your trips completed
          {stats.cancelledRides ? ` · ${stats.cancelledRides} cancelled` : ''}
        </AppText>
      ) : null}

      <Pressable style={styles.mapPressable}>
        <OnLight>
        {/* A quarter of the viewport instead of a flat 220pt: the map stays a
            map on a short phone and does not swallow a tablet. */}
        <MapMock height={responsive.vh(26, 150, 300)} showPulse variant="driverDashboard" />
        <AppText variant="bodySmall" color={theme.colors.muted} style={styles.nearbyLabel} numberOfLines={2}>
          <OnLight>
          {isOnline ? 'Waiting for ride requests nearby...' : 'Go online to see ride requests'}
          </OnLight>
        </AppText>
        </OnLight>
      </Pressable>

      <Pressable onPress={() => router.push('/driver/wallet' as Href)}>
        <AppCard backgroundColor={theme.colors.orangeLight} borderColor={theme.colors.orange} style={styles.walletCard}>
          <View style={styles.walletCopy}>
            <AppText variant="h3" numberOfLines={1}>Driver wallet</AppText>
            <AppText variant="bodySmall" color={theme.colors.muted} numberOfLines={2}>
              Balance, payouts, and recent transfers
            </AppText>
          </View>
          <AppText
            variant="monoLarge"
            color={theme.colors.orange}
            style={styles.walletBalance}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
            numberOfLines={1}>
            {formatNgn(balanceNgn)}
          </AppText>
        </AppCard>
      </Pressable>

      <AppButton
        onPress={() => router.push('/driver/earnings' as Href)}
        title="View earnings"
        variant="ghost"
      />
      <AppButton
        onPress={() => router.push('/driver/docs' as Href)}
        title="Your papers"
        variant="ghost"
      />

      <Pressable
        style={[
          styles.toggleButton,
          { minHeight: responsive.scale(52) },
          isOnline && styles.toggleButtonOffline,
        ]}
        onPress={handleToggleOnline}>
        <AppText variant="label" color={theme.colors.offWhite} numberOfLines={1}>
          {isOnline ? 'Go offline' : 'Go online'}
        </AppText>
      </Pressable>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  reliabilityLine: {
    textAlign: 'center',
    marginTop: -4,
  },
  container: {
    gap: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  mapPressable: {
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.borderLight,
    borderRadius: theme.radii.md,
    overflow: 'hidden',
    backgroundColor: theme.colors.mapBase,
    ...theme.shadows.card,
  },
  nearbyLabel: {
    textAlign: 'center',
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.white,
  },
  walletCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  walletCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  walletBalance: {
    flexShrink: 0,
    maxWidth: '45%',
  },
  toggleButton: {
    borderRadius: theme.radii.sm,
    paddingHorizontal: theme.spacing.md,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.orange,
    backgroundColor: theme.colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadows.card,
  },
  toggleButtonOffline: {
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.black,
  },
});
