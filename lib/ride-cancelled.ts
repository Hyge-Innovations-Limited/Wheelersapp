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
  const rideId = typeof payload.rideId === 'string' ? payload.rideId : undefined;
  if (isSearchingAgain(payload) && (!rideId || rideId === previous.rideId) && previous.status !== 'active' && previous.status !== 'completed') {
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
