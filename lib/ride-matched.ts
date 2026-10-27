/**
 * `ride:matched` for the rider: the ride is booked, with this driver. Pure,
 * so the session and the tests read the same rules.
 */

type MatchedDriver = {
  driverId: string;
  driverUserId?: string;
  driverName?: string;
  driverRating?: number;
  vehiclePlate?: string;
  vehicleModel?: string;
  etaSeconds?: number;
  lockedFareNgn?: number;
  driverPhone?: string;
};

type MatchableRide = {
  rideId: string;
  status: string;
  offers?: unknown[];
  driver?: MatchedDriver;
  tripCode?: string;
};

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** An event about another ride (an older search, another booking) is not about this one. */
export function isForRide(ride: { rideId: string } | null | undefined, payload: Record<string, unknown>): boolean {
  const rideId = str(payload.rideId);
  return Boolean(ride) && (!rideId || rideId === ride!.rideId);
}

/**
 * The ride, booked. What the screen knew of the driver carries over only when
 * it is the same driver; another driver (auto-accept booked someone else) is
 * that driver alone, with the fare the server agreed, never the previous
 * one's fare, phone or ETA.
 */
export function rideAfterMatched<T extends MatchableRide>(previous: T | null, payload: Record<string, unknown>): T | null {
  if (!previous || !isForRide(previous, payload)) return previous;
  const driverId = str(payload.driverId) ?? previous.driver?.driverId ?? '';
  const known = previous.driver && previous.driver.driverId === driverId ? previous.driver : undefined;
  return {
    ...previous,
    status: 'matched',
    // Booked: no offer on the table can be accepted any more.
    offers: [],
    driver: {
      driverId,
      driverUserId: str(payload.driverUserId) ?? known?.driverUserId,
      driverName: str(payload.driverName) ?? known?.driverName,
      driverRating: num(payload.driverRating) ?? known?.driverRating,
      vehiclePlate: str(payload.vehiclePlate) ?? known?.vehiclePlate,
      vehicleModel: str(payload.vehicleModel) ?? known?.vehicleModel,
      etaSeconds: num(payload.etaSeconds) ?? known?.etaSeconds,
      lockedFareNgn: num(payload.lockedFareNgn) ?? known?.lockedFareNgn ?? num(payload.agreedFareNgn),
      driverPhone: str(payload.driverPhone) ?? known?.driverPhone,
    },
    tripCode: str(payload.tripCode) ?? previous.tripCode,
  };
}
