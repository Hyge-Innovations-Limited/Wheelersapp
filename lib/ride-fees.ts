/**
 * How a fare is built and what the driver is paid. Mirrors
 * packages/config/src/pricing.ts in the backend — keep them in step.
 *
 * Since 2026-10-10 (pricing version 2) the driver prices the trip per km:
 *
 *   trip fare         ₦350/km × 10 km           ₦3,500      (the driver's price)
 *   + VAT 7.5%                                   ₦262.50
 *   + service charge                             ₦350
 *   = the rider's fare, rounded up to ₦50        ₦4,150      (the one amount a rider sees)
 *
 *   the driver is paid: the trip fare inside that fare (₦3,534.88)
 *   − commission 10% ₦353.49 − Lagos levy ₦30  = ₦3,151.39
 *
 * Version 1 (rides agreed before): the booking fee came off the fare, then 4%
 * commission, 7.5% VAT and the levy all came off the driver's share.
 */
export type PricingVersion = 1 | 2;
/** Wheelers' service charge inside every fare. Rides agreed under version 1 carried ₦375. */
export const BOOKING_FEE_NGN = 350;
export const V1_BOOKING_FEE_NGN = 375;
const bookingFeeOf = (version: PricingVersion) => (version === 1 ? V1_BOOKING_FEE_NGN : BOOKING_FEE_NGN);
export const COMMISSION_RATE = 0.1;
export const V1_COMMISSION_RATE = 0.04;
export const VAT_RATE = 0.075;
export const STATE_LEVY_NGN = 30;
export const MIN_FARE_NGN = 2500;
export const FARE_ROUNDING_INCREMENT = 50;
/** Old names, for code not yet moved. */
export const PLATFORM_FEE_RATE = COMMISSION_RATE;
export const SERVICE_FEE_NGN = BOOKING_FEE_NGN;

export interface RideFees {
  fareNgn: number;
  bookingFeeNgn: number;
  /** What the driver priced: rate per km × distance. Commission is a share of this. */
  tripFareNgn: number;
  /** Old name for the trip fare. */
  driverShareNgn: number;
  commissionNgn: number;
  vatNgn: number;
  stateLevyNgn: number;
  driverPayoutNgn: number;
  pricingVersion: PricingVersion;
  /** Old names: the commission, and the booking fee. */
  platformFeeNgn: number;
  serviceFeeNgn: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The version a server payload says a price was made under. An older server says nothing: version 1. */
export function pricingVersionOf(value: unknown): PricingVersion {
  return Number(value) === 2 ? 2 : 1;
}

/** The fare a rider pays when the driver's rate is `ratePerKmNgn` over `distanceKm`. */
export function fareFromRatePerKmNgn(ratePerKmNgn: number, distanceKm: number): number {
  const tripFare = round2(Math.max(0, ratePerKmNgn * distanceKm));
  const raw = round2(tripFare * (1 + VAT_RATE) + BOOKING_FEE_NGN);
  return Math.max(MIN_FARE_NGN, Math.ceil(raw / FARE_ROUNDING_INCREMENT) * FARE_ROUNDING_INCREMENT);
}

/** The trip fare inside a fare. */
export function tripFareNgn(fareNgn: number, version: PricingVersion = 2): number {
  const afterFee = Math.max(0, round2(fareNgn - bookingFeeOf(version)));
  return version === 1 ? afterFee : round2(afterFee / (1 + VAT_RATE));
}

export function rideFees(fareNgn: number, version: PricingVersion = 2): RideFees {
  const fare = round2(fareNgn);
  const booking = Math.min(bookingFeeOf(version), Math.max(0, fare));
  const afterFee = round2(fare - booking);
  const share = version === 1 ? afterFee : round2(afterFee / (1 + VAT_RATE));
  let commission = round2(share * (version === 1 ? V1_COMMISSION_RATE : COMMISSION_RATE));
  let vat = version === 1 ? round2(share * VAT_RATE) : round2(afterFee - share);
  let levy = STATE_LEVY_NGN;
  // A fare too small to carry every line never makes the driver pay to work (as on the server).
  let over = round2(commission + levy + (version === 1 ? vat : 0) - share);
  if (over > 0) { const cut = Math.min(levy, over); levy = round2(levy - cut); over = round2(over - cut); }
  if (over > 0) { const cut = Math.min(commission, over); commission = round2(commission - cut); over = round2(over - cut); }
  if (over > 0 && version === 1) { const cut = Math.min(vat, over); vat = round2(vat - cut); }
  return {
    fareNgn: fare,
    bookingFeeNgn: booking,
    tripFareNgn: share,
    driverShareNgn: share,
    commissionNgn: commission,
    vatNgn: vat,
    stateLevyNgn: levy,
    driverPayoutNgn: Math.max(0, round2(share - commission - levy - (version === 1 ? vat : 0))),
    pricingVersion: version,
    platformFeeNgn: commission,
    serviceFeeNgn: booking,
  };
}

/**
 * A fare as the driver's rate per km: the trip fare inside it ÷ distance, to
 * one decimal. It moves with every price (the rider's, a counter, each bid).
 * Null when the distance is unknown.
 */
export function driverRatePerKmNgn(
  priceNgn: number,
  distanceKm: number | null | undefined,
  version: PricingVersion = 2,
): number | null {
  if (!distanceKm || !Number.isFinite(distanceKm) || distanceKm <= 0 || !Number.isFinite(priceNgn)) return null;
  return Math.round((tripFareNgn(priceNgn, version) / distanceKm) * 10) / 10;
}

/** "₦312.5" or "₦350": one decimal only when there is one. */
export function formatPerKmNgn(value: number): string {
  const whole = Math.round(value) === value;
  return `₦${value.toLocaleString('en-NG', { minimumFractionDigits: whole ? 0 : 1, maximumFractionDigits: 1 })}`;
}

export interface RateBid {
  ratePerKmNgn: number;
  /** What the rider would pay at this rate. */
  fareNgn: number;
}

/**
 * Up to three rates to offer above the rider's price: the rider's own rate
 * rounded up to ₦5, then +₦15, +₦30 and +₦45 a km, never past the trip's
 * highest rate. Each comes with the fare the rider would see.
 */
export function suggestedRateBids(
  riderFareNgn: number,
  distanceKm: number | null | undefined,
  maxRatePerKmNgn?: number | null,
): RateBid[] {
  const riderRate = driverRatePerKmNgn(riderFareNgn, distanceKm, 2);
  if (riderRate === null || !distanceKm) return [];
  const base = Math.ceil(riderRate / 5) * 5;
  const out: RateBid[] = [];
  for (const step of [15, 30, 45]) {
    const rate = maxRatePerKmNgn ? Math.min(base + step, Math.floor(maxRatePerKmNgn)) : base + step;
    const fare = fareFromRatePerKmNgn(rate, distanceKm);
    if (fare > riderFareNgn && !out.some((bid) => bid.fareNgn === fare)) out.push({ ratePerKmNgn: rate, fareNgn: fare });
  }
  return out;
}

/** The parts of an offer that decide how a driver bids on it. */
export interface BidTerms {
  pricingVersion?: PricingVersion;
  plannedDistanceKm?: number | null;
  /** The highest fare a bid may come to, and the highest rate per km. */
  maxOfferNgn?: number | null;
  maxRatePerKmNgn?: number | null;
}

/** The driver types a rate per km (not a fare): the new pricing, on a trip whose distance is known. */
export function bidsPerKm(offer: BidTerms): boolean {
  return offer.pricingVersion === 2 && !!offer.plannedDistanceKm && Number.isFinite(offer.plannedDistanceKm) && offer.plannedDistanceKm > 0;
}

/**
 * The highest fare a bid may come to: the trip's ceiling, or the rider's own
 * price when they offered more than that. Null when the server set no ceiling.
 */
export function bidCeilingFareNgn(riderFareNgn: number, offer: BidTerms): number | null {
  if (offer.pricingVersion !== 2 || !offer.maxOfferNgn) return null;
  return Math.max(offer.maxOfferNgn, riderFareNgn);
}

export interface BidChoice {
  /** What the rider would pay: the amount a bid is sent as. */
  fareNgn: number;
  /** The driver's rate per km at that fare. Null when the distance is unknown. */
  ratePerKmNgn: number | null;
}

/** The one-tap bids above the rider's price. */
export function bidChoices(riderFareNgn: number, offer: BidTerms): BidChoice[] {
  if (bidsPerKm(offer)) return suggestedRateBids(riderFareNgn, offer.plannedDistanceKm, offer.maxRatePerKmNgn);
  const version = offer.pricingVersion ?? 1;
  const ceiling = bidCeilingFareNgn(riderFareNgn, offer);
  return suggestedBidsNgn(riderFareNgn)
    .filter((fareNgn) => ceiling === null || fareNgn <= ceiling)
    .map((fareNgn) => ({ fareNgn, ratePerKmNgn: driverRatePerKmNgn(fareNgn, offer.plannedDistanceKm, version) }));
}

/** How far one tap of +/- moves a rate: two down, two up. */
export const RATE_NUDGES_NGN = [-20, -10, 10, 20];

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
