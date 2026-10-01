/**
 * What comes off a fare before the driver is paid. Mirrors calculateRideFees in
 * the backend (packages/config/src/pricing.ts) — keep them in step. Since
 * 2026-10-01:
 *
 *   fare ₦3,500
 *   − booking fee ₦375 (Wheelers', taken first)  = your share ₦3,125 (₦312.5/km on 10 km)
 *   − commission 4% of your share                 ₦125
 *   − VAT 7.5% of your share                      ₦234.38
 *   − Lagos state levy                            ₦30
 *   = you are paid                                ₦2,735.62
 */
export const BOOKING_FEE_NGN = 375;
export const COMMISSION_RATE = 0.04;
export const VAT_RATE = 0.075;
export const STATE_LEVY_NGN = 30;
/** Old names, for code not yet moved. */
export const PLATFORM_FEE_RATE = COMMISSION_RATE;
export const SERVICE_FEE_NGN = BOOKING_FEE_NGN;

export interface RideFees {
  fareNgn: number;
  bookingFeeNgn: number;
  /** The fare after the booking fee: the driver's share, what per-km is worked from. */
  driverShareNgn: number;
  commissionNgn: number;
  vatNgn: number;
  stateLevyNgn: number;
  driverPayoutNgn: number;
  /** Old names: the commission, and the booking fee. */
  platformFeeNgn: number;
  serviceFeeNgn: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function rideFees(fareNgn: number, bookingFeeNgn: number = BOOKING_FEE_NGN): RideFees {
  const fare = round2(fareNgn);
  const booking = Math.min(bookingFeeNgn, Math.max(0, fare));
  const share = round2(fare - booking);
  let commission = round2(share * COMMISSION_RATE);
  let vat = round2(share * VAT_RATE);
  let levy = STATE_LEVY_NGN;
  // A fare too small to carry every line never makes the driver pay to work (as on the server).
  let over = round2(commission + vat + levy - share);
  if (over > 0) { const cut = Math.min(levy, over); levy = round2(levy - cut); over = round2(over - cut); }
  if (over > 0) { const cut = Math.min(commission, over); commission = round2(commission - cut); over = round2(over - cut); }
  if (over > 0) { const cut = Math.min(vat, over); vat = round2(vat - cut); }
  return {
    fareNgn: fare,
    bookingFeeNgn: booking,
    driverShareNgn: share,
    commissionNgn: commission,
    vatNgn: vat,
    stateLevyNgn: levy,
    driverPayoutNgn: Math.max(0, round2(share - commission - vat - levy)),
    platformFeeNgn: commission,
    serviceFeeNgn: booking,
  };
}

/**
 * A price as the driver's share per km — (price − booking fee) ÷ distance, to
 * one decimal: ₦3,500 over 10 km is ₦312.5/km. It moves with every price (the
 * rider's, a counter, each bid amount). Null when the distance is unknown.
 */
export function driverRatePerKmNgn(
  priceNgn: number,
  distanceKm: number | null | undefined,
  bookingFeeNgn: number = BOOKING_FEE_NGN,
): number | null {
  if (!distanceKm || !Number.isFinite(distanceKm) || distanceKm <= 0 || !Number.isFinite(priceNgn)) return null;
  return Math.round((Math.max(0, priceNgn - bookingFeeNgn) / distanceKm) * 10) / 10;
}

/** "₦312.5" or "₦350": one decimal only when there is one. */
export function formatPerKmNgn(value: number): string {
  const whole = Math.round(value) === value;
  return `₦${value.toLocaleString('en-NG', { minimumFractionDigits: whole ? 0 : 1, maximumFractionDigits: 1 })}`;
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
