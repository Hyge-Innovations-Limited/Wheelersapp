/**
 * `ride:cancelled` for the rider. Usually the end of the ride. With
 * `searchingAgain: true` the booked driver pulled out and the server goes on
 * searching on the same ride (the hold is released; new offers come in): the
 * ride goes back to finding drivers instead of ending.
 */

/** What the rider reads when their driver pulled out and the search goes on. */
export const DRIVER_LEFT_SEARCHING_AGAIN = 'Your driver cancelled. Finding another.';

type CancellableRide = {
  rideId: string;
  status: string;
  offers?: unknown[];
  driver?: unknown;
  driverLocation?: unknown;
  tripCode?: string;
  bidsCloseAt?: string;
  bidTimeout?: boolean;
  startedAt?: string;
  cancelReason?: string;
  cancelStage?: string;
};

export function isSearchingAgain(payload: Record<string, unknown>): boolean {
  return payload.searchingAgain === true;
}

export function rideAfterCancelled<T extends CancellableRide>(previous: T | null, payload: Record<string, unknown>): T | null {
  if (!previous) return previous;
  const rideId = typeof payload.rideId === 'string' && payload.rideId ? payload.rideId : undefined;
  // Another ride (an older search, a ride replaced by a newer one) is not this one.
  if (rideId && rideId !== previous.rideId) return previous;
  if (isSearchingAgain(payload) && previous.status !== 'active' && previous.status !== 'completed') {
    const bidsCloseAt =
      typeof payload.bidsCloseAt === 'string' && Number.isFinite(Date.parse(payload.bidsCloseAt))
        ? payload.bidsCloseAt
        : undefined;
    return {
      ...previous,
      status: 'bidding',
      offers: [],
      driver: undefined,
      driverLocation: undefined,
      tripCode: undefined,
      startedAt: undefined,
      bidTimeout: false,
      // The old search's close time is over; the server's new one, if it gave it (ride:search_status may follow).
      bidsCloseAt,
      cancelReason: undefined,
      cancelStage: undefined,
    };
  }
  return {
    ...previous,
    status: 'cancelled',
    cancelReason: typeof payload.reason === 'string' && payload.reason.trim() ? payload.reason : previous.cancelReason,
    cancelStage: typeof payload.cancelStage === 'string' && payload.cancelStage.trim() ? payload.cancelStage : previous.cancelStage,
  };
}

/**
 * `ride:bid_timeout`: nobody was booked before the search closed. Only for
 * the ride on screen, and only while it is a search (or Confirming, whose
 * booking then did not happen: no driver stays on it). A late one for a ride
 * already booked or under way changes nothing.
 */
export function rideAfterBidTimeout<T extends CancellableRide>(previous: T | null, payload: Record<string, unknown>): T | null {
  if (!previous) return previous;
  const rideId = typeof payload.rideId === 'string' && payload.rideId ? payload.rideId : undefined;
  if (rideId && rideId !== previous.rideId) return previous;
  if (previous.status !== 'bidding' && previous.status !== 'requesting' && previous.status !== 'matching') return previous;
  return { ...previous, status: 'bidding', bidTimeout: true, offers: [], driver: undefined };
}
