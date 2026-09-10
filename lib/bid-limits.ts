/**
 * The driver's side of the fare band.
 *
 * Wheelers is rider-priced: the rider names the fare, and a driver may haggle
 * upward only as far as ₦500/km. The server enforces this on every bid — these
 * values exist so the driver sees the cap while typing instead of getting a
 * rejection after they hit submit.
 *
 * Mirrors packages/config/src/pricing.ts in the backend; keep them in step.
 */
export const MAX_RATE_PER_KM_NGN = 500;
export const MIN_FARE_NGN = 2500;
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
