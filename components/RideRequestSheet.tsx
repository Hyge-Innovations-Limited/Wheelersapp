import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { AppButton } from '@/components/app-button';
import { AppText } from '@/components/app-text';
import { SectionHeader } from '@/components/SectionHeader';
import { theme } from '@/theme';

const PLATFORM_FEE_RATE = 0.0008; // 0.08%

function formatNgn(amount: number): string {
  return `₦${Math.round(amount).toLocaleString('en-NG')}`;
}

type RideRequestData = {
  riderName: string;
  distanceAwayKm: string;
  estimatedFare: string;
  estimatedFareNgn: number;
  rideDistanceKm: string;
  expiresInSeconds: number;
  pickupLabel: string;
  destinationLabel: string;
};

type RideRequestSheetProps = {
  request: RideRequestData;
  onAccept?: () => void;
  onDecline?: () => void;
};

export function RideRequestSheet({
  request,
  onAccept,
  onDecline,
}: RideRequestSheetProps) {
  const grossFare = request.estimatedFareNgn;
  const platformFee = Math.round(grossFare * PLATFORM_FEE_RATE);
  const driverPayout = grossFare - platformFee;

  return (
    <Animated.View entering={FadeInDown.duration(380)} style={styles.sheet}>
      <SectionHeader
        eyebrow="NEW RIDE REQUEST"
        title={request.riderName}
        subtitle={`${request.distanceAwayKm} km away`}
        titleVariant="h1"
      />
      <View style={styles.metrics}>
        <Metric title="Est. fare" value={request.estimatedFare} accent />
        <Metric title="Distance" value={request.rideDistanceKm} />
        <Metric title="Expires" value={`${request.expiresInSeconds}s`} danger />
      </View>

      {/* Fare breakdown */}
      <View style={styles.fareBreakdown}>
        <View style={styles.fareRow}>
          <AppText variant="bodySmall" color={theme.colors.muted}>Gross fare</AppText>
          <AppText variant="mono">{formatNgn(grossFare)}</AppText>
        </View>
        <View style={styles.fareRow}>
          <AppText variant="bodySmall" color={theme.colors.muted}>Platform fee (0.08%)</AppText>
          <AppText variant="mono" color={theme.colors.danger}>-{formatNgn(platformFee)}</AppText>
        </View>
        <View style={styles.fareDivider} />
        <View style={styles.fareRow}>
          <AppText variant="label">You earn</AppText>
          <AppText variant="monoLarge" color={theme.colors.green}>{formatNgn(driverPayout)}</AppText>
        </View>
      </View>

      <View style={styles.routeMeta}>
        <View style={styles.stopRow}>
          <View style={[styles.stopDot, { backgroundColor: theme.colors.green }]} />
          <AppText variant="bodySmall">{request.pickupLabel}</AppText>
        </View>
        <View style={styles.stopRow}>
          <View style={[styles.stopDot, { backgroundColor: theme.colors.orange }]} />
          <AppText variant="bodySmall">{request.destinationLabel}</AppText>
        </View>
      </View>
      <View style={styles.actions}>
        <AppButton title="Decline" variant="ghost" onPress={onDecline} style={styles.actionGhost} />
        <AppButton title="Accept ride" onPress={onAccept} style={styles.actionPrimary} />
      </View>
    </Animated.View>
  );
}

function Metric({
  title,
  value,
  accent,
  danger,
}: {
  title: string;
  value: string;
  accent?: boolean;
  danger?: boolean;
}) {
  return (
    <View style={styles.metric}>
      <AppText variant="bodySmall" color={theme.colors.muted}>
        {title}
      </AppText>
      <AppText
        variant="monoLarge"
        color={danger ? theme.colors.danger : accent ? theme.colors.orange : theme.colors.black}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: theme.colors.offWhite,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.borderLight,
    borderTopLeftRadius: theme.radii.lg,
    borderTopRightRadius: theme.radii.lg,
    padding: theme.spacing.lg,
    gap: theme.spacing.lg,
  },
  metrics: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  metric: {
    flex: 1,
    gap: theme.spacing.xxs,
  },
  fareBreakdown: {
    backgroundColor: theme.colors.white,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.borderLight,
    borderRadius: theme.radii.sm,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
    ...theme.shadows.subtle,
  },
  fareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fareDivider: {
    height: 1,
    backgroundColor: theme.colors.black,
    marginVertical: theme.spacing.xxs,
  },
  routeMeta: {
    gap: theme.spacing.sm,
  },
  stopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  stopDot: {
    width: 10,
    height: 10,
    borderRadius: theme.radii.pill,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.black,
  },
  actions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  actionGhost: {
    flex: 1,
  },
  actionPrimary: {
    flex: 2,
  },
});
