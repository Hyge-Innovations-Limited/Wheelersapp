import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { driverRatePerKmNgn, formatPerKmNgn, rideFees, type PricingVersion } from '@/lib/ride-fees';
import { theme } from '@/theme';

type PerKmChipProps = {
  /** The price being looked at: the rider's, a counter, or a bid amount. */
  priceNgn: number;
  distanceKm: number | null | undefined;
  /** The rules the price was made under: see lib/ride-fees.ts. */
  pricingVersion?: PricingVersion;
  /** Smaller, for under a price button. */
  compact?: boolean;
};

function naira(n: number): string {
  const kobo = Math.round(n * 100) % 100 !== 0;
  return `₦${n.toLocaleString('en-NG', { minimumFractionDigits: kobo ? 2 : 0, maximumFractionDigits: 2 })}`;
}

/**
 * What a price is worth per km to the driver, like Bolt shows it: a little car
 * and "₦351.2/km". It is the trip fare inside the rider's fare (the fare
 * without the booking fee and VAT) over the trip's distance, so it moves with
 * every price. Tap it to see how it is worked out; tap × to close.
 */
export function PerKmChip({ priceNgn, distanceKm, pricingVersion = 1, compact = false }: PerKmChipProps) {
  const [open, setOpen] = useState(false);
  const perKm = driverRatePerKmNgn(priceNgn, distanceKm, pricingVersion);
  if (perKm === null || !distanceKm) return null;
  const fees = rideFees(priceNgn, pricingVersion);
  const share = fees.tripFareNgn;

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => setOpen((was) => !was)}
        accessibilityRole="button"
        accessibilityLabel={`${formatPerKmNgn(perKm)} per kilometre. Tap to see how it is worked out.`}
        style={({ pressed }) => [styles.chip, compact && styles.chipCompact, pressed && styles.pressed]}>
        <View style={[styles.car, compact && styles.carCompact]}>
          <Ionicons name="car-sport" size={compact ? 11 : 13} color={theme.colors.white} />
        </View>
        <AppText variant={compact ? 'caption' : 'label'} color={theme.colors.black}>
          {formatPerKmNgn(perKm)}
          <AppText variant={compact ? 'caption' : 'label'} color={theme.colors.muted}>/km</AppText>
        </AppText>
      </Pressable>

      {open ? (
        <View style={styles.explain}>
          <View style={styles.explainTop}>
            <AppText variant="label">{pricingVersion === 2 ? 'Your rate per km' : 'Your share per km'}</AppText>
            <Pressable onPress={() => setOpen(false)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={18} color={theme.colors.muted} />
            </Pressable>
          </View>
          <AppText variant="caption" color={theme.colors.muted}>
            {pricingVersion === 2
              ? `${naira(priceNgn)} − ${naira(fees.bookingFeeNgn)} booking fee − ${naira(fees.vatNgn)} VAT = ${naira(share)}`
              : `${naira(priceNgn)} − ${naira(fees.bookingFeeNgn)} booking fee = ${naira(share)}`}
          </AppText>
          <AppText variant="caption" color={theme.colors.muted}>
            {naira(share)} ÷ {distanceKm.toFixed(1)} km = {formatPerKmNgn(perKm)}/km
          </AppText>
          <AppText variant="caption" color={theme.colors.mutedLight}>
            {pricingVersion === 2
              ? `You receive ${naira(fees.driverPayoutNgn)}: the trip fare less 10% commission and the ₦30 levy. The rider pays the VAT and the booking fee.`
              : 'Commission (4%), VAT (7.5%) and the ₦30 levy come out of your share when the trip is paid.'}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'flex-start', gap: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingLeft: 4,
    paddingRight: 10,
    borderRadius: theme.radii.pill,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.orangeLight,
  },
  chipCompact: { paddingVertical: 2, paddingLeft: 3, paddingRight: 8, gap: 4 },
  car: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: theme.colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  carCompact: { width: 18, height: 18, borderRadius: 9 },
  pressed: { opacity: 0.75 },
  explain: {
    maxWidth: 280,
    gap: 3,
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.white,
  },
  explainTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm },
});
