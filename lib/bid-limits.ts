/**
 * The driver's side of the price: there is no band. A driver may bid below the
 * rider's price, at it, or above it — the rider decides. The one refusal is a
 * bid so far above the rider's price that it can only be a typo (ten times).
 *
 * Mirrors validateDriverOffer in packages/config/src/pricing.ts; keep them in step.
 */
export const MIN_FARE_NGN = 2500;
export const DRIVER_BID_TYPO_MULTIPLE = 10;

/** The most a driver can send on a trip: a typo guard, not a ceiling. Null when the rider's price is unknown. */
export function bidCeilingNgn(riderOfferNgn: number | undefined | null): number | null {
  if (riderOfferNgn === undefined || riderOfferNgn === null || !Number.isFinite(riderOfferNgn) || riderOfferNgn <= 0) return null;
  return Math.max(MIN_FARE_NGN, Math.round(riderOfferNgn) * DRIVER_BID_TYPO_MULTIPLE);
}

/** @deprecated the ₦500/km ceiling is gone; kept for callers not yet moved to bidCeilingNgn. */
export const MAX_RATE_PER_KM_NGN = 500;
const FARE_ROUNDING_INCREMENT = 100;

/**
 * Highest bid allowed on a trip, or null when the trip length is unknown —
 * a missing distance must not block a driver from bidding at all, so the
 * screen simply shows no cap and lets the server have the final word.
 */
export function maxBidNgn(distanceKm: number | undefined | null): number | null {
  if (distanceKm === undefined || distanceKm === null) return null;
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return null;
  return Math.max(
    MIN_FARE_NGN,
    Math.ceil((MAX_RATE_PER_KM_NGN * distanceKm) / FARE_ROUNDING_INCREMENT) *
      FARE_ROUNDING_INCREMENT,
  );
}
