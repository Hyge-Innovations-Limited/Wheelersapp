/**
 * The rider's "Finding drivers" screen: how many drivers saw the price, the
 * clock to the end of the search, and when to nudge a raise. Pure, so the
 * screen and the tests read the same rules.
 */

/** After this long with no offer, the screen suggests raising the price. */
export const RAISE_NUDGE_AFTER_MS = 2 * 60_000;

type SearchFields = { rideId: string; driversNotified?: number | null; bidsCloseAt?: string };

/**
 * `ride:search_status` { rideId, driversNotified, bidsCloseAt } from newer
 * servers. Only for the ride on screen; a missing or bad field keeps what was
 * there. Returns the same object when nothing changes.
 */
export function applySearchStatus<T extends SearchFields>(ride: T | null, payload: Record<string, unknown>): T | null {
  if (!ride || payload.rideId !== ride.rideId) return ride;
  const count = payload.driversNotified;
  const driversNotified =
    typeof count === 'number' && Number.isFinite(count) && count >= 0
      ? Math.floor(count)
      : count === null
        ? null
        : ride.driversNotified;
  const close = payload.bidsCloseAt;
  const bidsCloseAt =
    typeof close === 'string' && Number.isFinite(Date.parse(close)) ? close : ride.bidsCloseAt;
  if (driversNotified === ride.driversNotified && bidsCloseAt === ride.bidsCloseAt) return ride;
  return { ...ride, driversNotified, bidsCloseAt };
}

/** "5 drivers saw your price", "1 driver saw your price"; null when unknown or none. */
export function driversSawLine(driversNotified: number | null | undefined): string | null {
  if (typeof driversNotified !== 'number' || !Number.isFinite(driversNotified) || driversNotified <= 0) return null;
  const n = Math.floor(driversNotified);
  return `${n} ${n === 1 ? 'driver' : 'drivers'} saw your price`;
}

/** "4:32" until the search closes; null when there is no close time or it has passed. */
export function searchClock(bidsCloseAt: string | null | undefined, nowMs: number): string | null {
  if (!bidsCloseAt) return null;
  const closes = Date.parse(bidsCloseAt);
  if (!Number.isFinite(closes)) return null;
  const left = Math.ceil((closes - nowMs) / 1000);
  if (left <= 0) return null;
  return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
}

/** Two minutes at this price and no offer yet: time to suggest a raise. */
export function shouldNudgeRaise(input: { pricedAtMs: number | null; nowMs: number; offerCount: number }): boolean {
  if (input.pricedAtMs === null || input.offerCount > 0) return false;
  return input.nowMs - input.pricedAtMs >= RAISE_NUDGE_AFTER_MS;
}
