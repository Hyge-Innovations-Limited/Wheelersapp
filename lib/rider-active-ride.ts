import type { RiderActiveRideDetail } from '@/lib/api';

/**
 * The rider's trip as the server has it, turned into what the ride screen
 * shows: after a restart the app had forgotten the trip (and its trip code,
 * which the driver cannot start without). A search still open is restored
 * too, with the offers drivers have made, so a rider who closed the app comes
 * back to the drivers who answered and not to an empty home screen.
 */

const MATCHED = new Set(['DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE', 'ARRIVED']);

export type RestoredOffer = {
  driverId: string;
  driverUserId: string;
  counterOfferNgn: number;
  driverName: string;
  driverRating: number;
  vehiclePlate: string;
  vehicleModel: string;
  etaSeconds: number;
  distanceKm?: number;
  receivedAt: string;
};

export type RestoredRide = {
  rideId: string;
  status: 'bidding' | 'matched' | 'active';
  /** This ride was brought back from the server, not started in this run of the app. */
  restored: true;
  /** A search: what the rider is offering, when it closes, and the open offers (cheapest first). */
  riderOfferNgn?: number;
  bidsCloseAt?: string;
  offers?: RestoredOffer[];
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

const SEARCHING = new Set(['REQUESTED', 'MATCHING']);

function itineraryOf(ride: RiderActiveRideDetail) {
  return {
    pickup: ride.pickup.address,
    // The destination is the last stop, as the ride screen draws it.
    stops: [...ride.stops.filter((s) => s.type === 'INTERMEDIATE').map((s) => s.address), ride.destination.address],
  };
}

/** A search the server says is still open (and not past its closing time), or null. */
function restoredSearchFrom(ride: RiderActiveRideDetail, now: number): RestoredRide | null {
  if (!SEARCHING.has(ride.status) || !ride.search) return null;
  const closes = Date.parse(ride.search.bidsCloseAt);
  if (!Number.isFinite(closes) || closes <= now) return null;
  return {
    rideId: ride.id,
    status: 'bidding',
    restored: true,
    itinerary: itineraryOf(ride),
    fareEstimateNgn: ride.fareEstimateNgn ?? undefined,
    ...(typeof ride.riderOfferNgn === 'number' ? { riderOfferNgn: ride.riderOfferNgn } : {}),
    bidsCloseAt: ride.search.bidsCloseAt,
    offers: ride.search.offers
      .filter((offer) => offer.counterOfferNgn > 0)
      .map((offer) => ({
        driverId: offer.driverId,
        driverUserId: offer.driverUserId,
        counterOfferNgn: offer.counterOfferNgn,
        driverName: offer.driverName,
        driverRating: offer.driverRating ?? 5,
        vehiclePlate: offer.vehiclePlate,
        vehicleModel: offer.vehicleModel,
        etaSeconds: offer.etaSeconds,
        ...(typeof offer.distanceKm === 'number' ? { distanceKm: offer.distanceKm } : {}),
        receivedAt: offer.receivedAt,
      }))
      .sort((a, b) => a.counterOfferNgn - b.counterOfferNgn || a.etaSeconds - b.etaSeconds),
  };
}

export function restoredRideFrom(ride: RiderActiveRideDetail | null | undefined, now = Date.now()): RestoredRide | null {
  if (!ride) return null;
  if (!ride.driver) return restoredSearchFrom(ride, now);
  const status = ride.status === 'IN_PROGRESS' ? 'active' : MATCHED.has(ride.status) ? 'matched' : null;
  if (!status) return null;
  const vehicle = [ride.driver.vehicleMake, ride.driver.vehicleModel].filter(Boolean).join(' ');
  return {
    rideId: ride.id,
    status,
    restored: true,
    ...(ride.tripCode && status === 'matched' ? { tripCode: ride.tripCode } : {}),
    itinerary: itineraryOf(ride),
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
