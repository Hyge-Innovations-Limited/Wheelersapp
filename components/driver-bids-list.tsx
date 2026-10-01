import { Href, useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppCard } from '@/components/app-card';
import { AppText } from '@/components/app-text';
import type { DriverBidRecord, DriverBidStatus } from '@/lib/api';
import { useDriverSession } from '@/lib/driver-session';
import { theme } from '@/theme';

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

/** What each outcome means to the driver, in their words. */
export function describeBidStatus(status: DriverBidStatus): { label: string; color: string } {
  switch (status) {
    case 'PENDING':
      return { label: 'Waiting for rider', color: theme.colors.green };
    case 'ACCEPTED':
      return { label: 'Won', color: theme.colors.green };
    case 'LOST':
      return { label: 'Taken by another driver', color: theme.colors.muted };
    case 'WITHDRAWN':
      return { label: 'Withdrawn', color: theme.colors.muted };
    case 'EXPIRED':
      return { label: 'No answer', color: theme.colors.muted };
    case 'CANCELLED':
      return { label: 'Ride cancelled', color: theme.colors.danger };
    case 'DECLINED':
      return { label: 'Declined', color: theme.colors.danger };
    default:
      return { label: String(status).replace(/_/g, ' '), color: theme.colors.muted };
  }
}

/**
 * Every bid the driver has on the table right now, then every bid they've
 * ever sent. Live bids come from the socket session (they update the instant
 * the rider pays); past ones from the backend's bid history.
 */
export function DriverBidsList({ history }: { history: DriverBidRecord[] }) {
  const router = useRouter();
  const { session } = useDriverSession();

  // Live negotiation moved to the Active tab — History tells finished
  // stories only. Bids mid-flight are excluded here, not duplicated.
  const liveNow = Object.values(session.pendingBids ?? {}).filter((b) => !b.outcome).length;
  const pastBids = history;

  if (liveNow === 0 && pastBids.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <AppText variant="body" color={theme.colors.muted} style={styles.emptyText}>
          No bids yet. When a ride request comes in, accept it or name your price — every bid you send shows up here.
        </AppText>
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {liveNow > 0 ? (
        <Pressable
          onPress={() => router.push('/driver/(tabs)/active' as Href)}
          style={({ pressed }) => [styles.liveLink, pressed && styles.pressed]}>
          <AppText variant="bodySmall" color={theme.colors.orange}>
            {liveNow} live bid{liveNow === 1 ? '' : 's'} in play — see the Active tab ›
          </AppText>
        </Pressable>
      ) : null}
      {pastBids.length > 0 ? (
        <AppText variant="label" color={theme.colors.muted} style={styles.sectionTitle}>
          All bids
        </AppText>
      ) : null}
      {pastBids.map((bid) => {
        const status = describeBidStatus(bid.status);
        const won = bid.status === 'ACCEPTED';
        const fare = won && bid.ride.agreedFareNgn !== null ? bid.ride.agreedFareNgn : bid.amountNgn;
        return (
          <AppCard key={bid.id} style={styles.card}>
            <View style={styles.top}>
              <View style={styles.info}>
                <AppText variant="bodyMedium" numberOfLines={1}>
                  {bid.ride.pickupAddress}
                </AppText>
                <AppText variant="bodySmall" color={theme.colors.muted} numberOfLines={1}>
                  to {bid.ride.destAddress}
                </AppText>
              </View>
              <AppText
                variant="mono"
                color={won ? theme.colors.green : theme.colors.muted}
                style={styles.amount}
                numberOfLines={1}>
                {formatNgn(fare)}
              </AppText>
            </View>
            <View style={styles.bottom}>
              <AppText variant="bodySmall" color={theme.colors.muted} numberOfLines={1}>
                {formatDate(bid.createdAt)}
                {bid.ride.riderOfferNgn !== null && bid.ride.riderOfferNgn !== bid.amountNgn
                  ? ` · rider offered ${formatNgn(bid.ride.riderOfferNgn)}`
                  : ''}
              </AppText>
              <View style={[styles.dot, { backgroundColor: status.color }]} />
              <AppText variant="bodySmall" color={status.color} numberOfLines={1} style={styles.statusText}>
                {status.label}
                {won ? ` · ${bid.ride.status.replace(/_/g, ' ').toLowerCase()}` : ''}
              </AppText>
            </View>
          </AppCard>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 10,
  },
  sectionTitle: {
    marginTop: 4,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 36,
  },
  emptyText: {
    textAlign: 'center',
    maxWidth: '75%',
  },
  liveLink: {
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  pressed: {
    opacity: 0.7,
  },
  card: {
    gap: 10,
  },
  cardLive: {
    borderColor: theme.colors.green,
  },
  cardAccepted: {
    borderColor: theme.colors.orange,
    backgroundColor: theme.colors.orangeLight,
  },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  info: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  amount: {
    flexShrink: 0,
  },
  bottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusText: {
    flexShrink: 1,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
