import type { RiderActiveRideDetail } from '@/lib/api';

/**
 * The rider's trip as the server has it, turned into what the ride screen
 * shows: after a restart the app had forgotten the trip (and its trip code,
 * which the driver cannot start without). Only a trip with a driver is
 * restored; a search is not.
 */

const MATCHED = new Set(['DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE', 'ARRIVED']);

export type RestoredRide = {
  rideId: string;
  status: 'matched' | 'active';
  tripCode?: string;
  itinerary: { pickup: string; stops: string[] };
  fareEstimateNgn?: number;
  startedAt?: string;
  driver?: {
    driverId: string;
    driverUserId?: string;
    driverName?: string;
    driverRating?: number;
    vehiclePlate?: string;
    vehicleModel?: string;
  };
};

export function restoredRideFrom(ride: RiderActiveRideDetail | null | undefined): RestoredRide | null {
  if (!ride?.driver) return null;
  const status = ride.status === 'IN_PROGRESS' ? 'active' : MATCHED.has(ride.status) ? 'matched' : null;
  if (!status) return null;
  const vehicle = [ride.driver.vehicleMake, ride.driver.vehicleModel].filter(Boolean).join(' ');
  return {
    rideId: ride.id,
    status,
    ...(ride.tripCode && status === 'matched' ? { tripCode: ride.tripCode } : {}),
    itinerary: {
      pickup: ride.pickup.address,
      // The destination is the last stop, as the ride screen draws it.
      stops: [...ride.stops.filter((s) => s.type === 'INTERMEDIATE').map((s) => s.address), ride.destination.address],
    },
    fareEstimateNgn: ride.agreedFareNgn ?? ride.fareEstimateNgn ?? undefined,
    ...(ride.startedAt ? { startedAt: ride.startedAt } : {}),
    driver: {
      driverId: ride.driver.id,
      driverUserId: ride.driver.userId,
      driverName: ride.driver.name ?? undefined,
      driverRating: ride.driver.rating ?? undefined,
      vehiclePlate: ride.driver.vehiclePlate ?? undefined,
      vehicleModel: vehicle || undefined,
    },
  };
}
