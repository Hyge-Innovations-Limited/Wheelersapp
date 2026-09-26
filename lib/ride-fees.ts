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

/**
 * How far one tap of +/- moves a bid. A fixed ₦200 is a shrug on a ₦25,000 ride and a
 * leap on a ₦900 one, so the step follows the price: about 2% of it, snapped to a round
 * naira figure — ₦100 on small fares, ₦500 around ₦25,000, ₦1,000 above ₦50,000.
 */
export function bidStepNgn(priceNgn: number): number {
  if (!Number.isFinite(priceNgn) || priceNgn <= 0) return 100;
  const raw = priceNgn * 0.02;
  const steps = [100, 200, 500, 1000, 2000, 5000];
  for (const step of steps) if (raw <= step) return step;
  return steps[steps.length - 1];
}

/** The four nudges around a price: two down, two up, in that price's step. */
export function bidNudgesNgn(priceNgn: number): number[] {
  const step = bidStepNgn(priceNgn);
  return [-2 * step, -step, step, 2 * step];
}
