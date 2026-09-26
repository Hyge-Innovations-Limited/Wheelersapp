import { Href, useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { AppText } from '@/components/app-text';
import { DriverRequestFeed } from '@/components/driver-request-feed';
import { useDriverSession } from '@/lib/driver-session';
import { useResponsive } from '@/lib/responsive';
import { theme } from '@/theme';

function formatNgn(amount: number): string {
  return `NGN ${Math.round(amount).toLocaleString('en-NG')}`;
}

function tripScreenFor(status: string): Href | null {
  switch (status) {
    case 'navigating': return '/driver/navigation' as Href;
    case 'arrived': return '/driver/arrived' as Href;
    case 'active': return '/driver/active-trip' as Href;
    default: return null;
  }
}

/**
 * Everything in flight, in one place: the trip you're on, requests you
 * haven't answered, bids waiting on riders, negotiations mid-counter — and
 * any booking you walked away from, still here to come back to. Live work
 * lives HERE; History is only for what's finished.
 */
export default function DriverActiveScreen() {
  const router = useRouter();
  const { session } = useDriverSession();
  const responsive = useResponsive();

  const currentRide = session.currentRide;
  const tripScreen = tripScreenFor(session.status);
  const liveCount =
    session.offers.length +
    Object.values(session.pendingBids).filter((bid) => !bid.outcome).length;
  const showFeed =
    liveCount > 0 ||
    Object.keys(session.pendingBids).length > 0 ||
    session.missedOffers.length > 0;

  return (
    <AppScreen
      safeAreaEdges={['top', 'left', 'right']}
      contentStyle={[styles.container, { gap: responsive.scale(14) }]}>
      <View style={styles.headerRow}>
        <AppText variant="h1" numberOfLines={1}>Active</AppText>
        <Pressable onPress={() => router.push('/driver/(tabs)/history?tab=bids' as Href)}>
          <AppText variant="caption" color={theme.colors.orange}>Past bids ›</AppText>
        </Pressable>
      </View>

      {currentRide && tripScreen ? (
        <Pressable
          onPress={() => router.push(tripScreen)}
          style={({ pressed }) => [styles.tripCard, pressed && styles.pressed]}>
          <View style={styles.tripCopy}>
            <AppText variant="label" color={theme.colors.green}>
              Trip in progress · {formatNgn(currentRide.fareNgn)}
              {currentRide.riderPaid ? ' · paid' : ''}
            </AppText>
            <AppText variant="bodySmall" color={theme.colors.muted} numberOfLines={1}>
              {session.status === 'active'
                ? `To ${currentRide.destination.address}`
                : `Pickup at ${currentRide.pickup.address}`}
            </AppText>
          </View>
          <AppText variant="h3" color={theme.colors.orange}>›</AppText>
        </Pressable>
      ) : null}

      {!showFeed && !currentRide ? (
        <View style={styles.emptyWrap}>
          <AppText variant="h3" style={styles.emptyTitle}>Nothing in flight</AppText>
          <AppText variant="body" color={theme.colors.muted} style={styles.emptyText}>
            {session.status === 'offline'
              ? 'Go online and new ride requests land here — along with every bid you have on the table.'
              : 'You are online. Requests and your live bids will appear here the moment they exist.'}
          </AppText>
        </View>
      ) : (
        <DriverRequestFeed fullHeight />
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: theme.spacing.lg,
    flexGrow: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tripCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    backgroundColor: theme.colors.white,
    borderRadius: theme.radii.md,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.green,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    ...theme.shadows.card,
  },
  tripCopy: {
    flex: 1,
    gap: 2,
  },
  pressed: {
    opacity: 0.7,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xl,
  },
  emptyTitle: {
    textAlign: 'center',
  },
  emptyText: {
    textAlign: 'center',
  },
});
