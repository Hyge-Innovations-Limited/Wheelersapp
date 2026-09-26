/**
 * What comes off a fare before the driver is paid. Mirrors calculateRideFees in
 * the backend (packages/config/src/pricing.ts) — keep them in step:
 * a 4% platform fee shown as "Fees", a ₦375 service fee, the ₦30 Lagos levy.
 * No VAT line.
 */
export const PLATFORM_FEE_RATE = 0.04;
export const SERVICE_FEE_NGN = 375;
export const STATE_LEVY_NGN = 30;

export interface RideFees {
  fareNgn: number;
  platformFeeNgn: number;
  serviceFeeNgn: number;
  stateLevyNgn: number;
  driverPayoutNgn: number;
}

export function rideFees(fareNgn: number): RideFees {
  const platformFeeNgn = Math.round(fareNgn * PLATFORM_FEE_RATE * 100) / 100;
  const deductions = platformFeeNgn + SERVICE_FEE_NGN + STATE_LEVY_NGN;
  return {
    fareNgn,
    platformFeeNgn,
    serviceFeeNgn: SERVICE_FEE_NGN,
    stateLevyNgn: STATE_LEVY_NGN,
    // Never below zero: on a tiny fare the platform's take is capped at the fare, as on the server.
    driverPayoutNgn: Math.max(0, Math.round((fareNgn - deductions) * 100) / 100),
  };
}

/** Three prices to offer above the rider's, like the cards riders know: +5%, +15%, +25%, rounded to ₦100. */
export function suggestedBidsNgn(riderOfferNgn: number): number[] {
  if (!Number.isFinite(riderOfferNgn) || riderOfferNgn <= 0) return [];
  const round100 = (n: number) => Math.round(n / 100) * 100;
  const out: number[] = [];
  for (const factor of [1.05, 1.15, 1.25]) {
    const amount = round100(riderOfferNgn * factor);
    if (amount > riderOfferNgn && !out.includes(amount)) out.push(amount);
  }
  return out;
}
