import { Href, useRouter } from 'expo-router';
import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppCard } from '@/components/app-card';
import { AppScreen } from '@/components/app-screen';
import { AppText } from '@/components/app-text';
import { FloatingView } from '@/components/motion';
import { SectionHeader } from '@/components/SectionHeader';
import { useDriverSession } from '@/lib/driver-session';
import { useResponsive } from '@/lib/responsive';
import { rideFees } from '@/lib/ride-fees';
import { theme } from '@/theme';


function formatNgn(amount: number): string {
  return `NGN ${Math.round(amount).toLocaleString('en-NG')}`;
}

export default function DriverPayoutScreen() {
  const router = useRouter();
  const { session, goOffline, clearCompleted, rateRider } = useDriverSession();
  const [givenRating, setGivenRating] = useState<number | null>(null);
  const responsive = useResponsive();
  const ride = session.currentRide;

  const grossFare = ride?.completedFareNgn ?? ride?.fareNgn ?? 0;
  const fees = rideFees(grossFare);
  const serviceFeeNgn = fees.serviceFeeNgn;
  const platformFeeNgn = fees.platformFeeNgn;
  const stateLevyNgn = fees.stateLevyNgn;
  const finalPayout = fees.driverPayoutNgn;

  const handleNextRide = () => {
    clearCompleted();
    router.replace('/driver/(tabs)/home' as Href);
  };

  const handleGoOffline = async () => {
    await goOffline();
    router.replace('/driver/(tabs)/home' as Href);
  };

  return (
    <AppScreen backgroundColor={theme.colors.offWhite} scroll contentStyle={styles.container}>
      <StatusBar style="dark" backgroundColor={theme.colors.offWhite} />
      <Confetti color={theme.colors.orange} style={styles.confettiOne} />
      <Confetti color={theme.colors.black} style={styles.confettiTwo} />
      <Confetti color={theme.colors.green} style={styles.confettiThree} />

      <SectionHeader
        actionLabel="View earnings"
        onActionPress={() => router.push('/driver/earnings' as Href)}
        title="Ride complete"
      />

      <View style={styles.earningsWrap}>
        <AppText variant="bodySmall" color={theme.colors.muted}>
          YOU EARNED
        </AppText>
        <AppText
          variant="display"
          color={theme.colors.orange}
          style={styles.amount}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
          numberOfLines={1}>
          {formatNgn(finalPayout)}
        </AppText>
      </View>

      <AppCard style={styles.summaryCard}>
        <View style={styles.riderPaidRow}>
          <AppText variant="bodySmall" color={theme.colors.muted}>
            Rider paid
          </AppText>
          <AppText variant="monoLarge" color={theme.colors.green} numberOfLines={1} style={styles.rowValue}>
            {formatNgn(grossFare)}
          </AppText>
        </View>
        <SummaryRow
          color={theme.colors.danger}
          label="Service fee"
          value={`-${formatNgn(serviceFeeNgn)}`}
        />
        <SummaryRow
          color={theme.colors.danger}
          label="Fees (4%)"
          value={`-${formatNgn(platformFeeNgn)}`}
        />
        <SummaryRow
          color={theme.colors.danger}
          label="State levy"
          value={`-${formatNgn(stateLevyNgn)}`}
        />
        {ride?.distanceKm != null && (
          <SummaryRow label="Distance" value={`${ride.distanceKm.toFixed(1)} km`} />
        )}
        {ride?.durationSeconds != null && (
          <SummaryRow label="Duration" value={`${Math.ceil(ride.durationSeconds / 60)} min`} />
        )}
        <View style={styles.totalRow}>
          <AppText variant="bodyMedium">
            {ride?.paymentMethod === 'CASH' ? 'Collect in cash' : 'Credited to wallet'}
          </AppText>
          <AppText variant="monoLarge" color={theme.colors.orange} numberOfLines={1} style={styles.rowValue}>
            {formatNgn(finalPayout)}
          </AppText>
        </View>
      </AppCard>

      {/* Two-sided reputation starts here: the driver's one-tap verdict on
          the rider, at the exact moment the trip is fresh. */}
      {ride ? (
        <View style={styles.rateWrap}>
          <AppText variant="label" color={theme.colors.muted}>
            {givenRating ? 'Thanks — rating sent' : 'How was the rider?'}
          </AppText>
          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((star) => (
              <Pressable
                key={star}
                disabled={givenRating !== null}
                onPress={() => {
                  setGivenRating(star);
                  rateRider(ride.rideId, ride.riderId, star).catch(() => setGivenRating(null));
                }}
                style={({ pressed }) => [styles.star, pressed && styles.starPressed]}>
                <AppText variant="h2" color={(givenRating ?? 0) >= star ? theme.colors.orange : theme.colors.borderLight}>
                  ★
                </AppText>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <AppButton title="Next ride" onPress={handleNextRide} />
      <Pressable
        style={[styles.offlineButton, { minHeight: responsive.scale(52) }]}
        onPress={handleGoOffline}>
        <AppText variant="label" color={theme.colors.offWhite}>
          Go offline
        </AppText>
      </Pressable>
    </AppScreen>
  );
}

function SummaryRow({
  label,
  value,
  color = theme.colors.black,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <View style={styles.row}>
      <AppText variant="bodySmall" color={theme.colors.muted} numberOfLines={2}>
        {label}
      </AppText>
      <AppText variant="mono" color={color} numberOfLines={1} style={styles.rowValue}>
        {value}
      </AppText>
    </View>
  );
}

function Confetti({
  color,
  style,
}: {
  color: string;
  style: object;
}) {
  return (
    <FloatingView distance={14} style={style}>
      <View style={[styles.confettiPiece, { backgroundColor: color }]} />
    </FloatingView>
  );
}

const styles = StyleSheet.create({
  rateWrap: {
    alignItems: 'center',
    gap: 4,
    marginBottom: theme.spacing.md,
  },
  starsRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  star: {
    paddingHorizontal: 4,
  },
  starPressed: {
    opacity: 0.6,
  },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    gap: theme.spacing.lg,
  },
  earningsWrap: {
    alignItems: 'center',
    gap: theme.spacing.xxs,
  },
  amount: {
    textAlign: 'center',
  },
  summaryCard: {
    gap: theme.spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  rowValue: {
    flexShrink: 0,
    textAlign: 'right',
  },
  riderPaidRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.md,
    borderBottomWidth: theme.borders.thick,
    borderBottomColor: theme.colors.borderLight,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: theme.spacing.md,
    borderTopWidth: theme.borders.thick,
    borderTopColor: theme.colors.black,
  },
  offlineButton: {
    borderRadius: theme.radii.sm,
    paddingHorizontal: theme.spacing.md,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.black,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadows.card,
  },
  confettiPiece: {
    width: 9,
    height: 9,
    borderRadius: 3,
  },
  confettiOne: {
    position: 'absolute',
    top: 72,
    left: '18%',
  },
  confettiTwo: {
    position: 'absolute',
    top: 94,
    left: '46%',
  },
  confettiThree: {
    position: 'absolute',
    top: 118,
    left: '72%',
  },
});
