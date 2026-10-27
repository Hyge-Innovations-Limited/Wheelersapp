import type { RiderActiveRideDetail } from '@/lib/api';
import { offersAfterServerList, type OfferEvent, type RideOffer } from '@/lib/ride-offers';

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
  /** The server gave the search's details: a server that books by itself (auto-accept). */
  autoAcceptSupported?: boolean;
  /** The rider's yes to auto-booking this search, when the server says (newer servers). */
  autoAcceptChosen?: boolean;
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
    /** The fare the server agreed with this driver. */
    lockedFareNgn?: number;
    driverPhone?: string;
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
    autoAcceptSupported: true,
    ...(typeof ride.autoAccept === 'boolean' ? { autoAcceptChosen: ride.autoAccept } : {}),
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
      ...(typeof ride.agreedFareNgn === 'number' ? { lockedFareNgn: ride.agreedFareNgn } : {}),
      ...(ride.driver.phone ? { driverPhone: ride.driver.phone } : {}),
    },
  };
}

/**
 * What the server says about the rider's ride, for squaring the screen with it:
 * - ride: a trip with a driver, or a search with its offers;
 * - unknown: the server has the ride as a search but says nothing more (an
 *   older server without `search`, or one past its closing time and about to end);
 * - none: no active ride.
 */
export type ServerAnswer =
  | { kind: 'none' }
  | { kind: 'unknown'; rideId: string }
  | { kind: 'ride'; ride: RestoredRide };

export function serverAnswerFrom(ride: RiderActiveRideDetail | null | undefined, now = Date.now()): ServerAnswer {
  if (!ride) return { kind: 'none' };
  const restored = restoredRideFrom(ride, now);
  if (restored) return { kind: 'ride', ride: restored };
  if (SEARCHING.has(ride.status)) return { kind: 'unknown', rideId: ride.id };
  return { kind: 'none' };
}

type DriverLike = { driverId: string } & Record<string, unknown>;

/**
 * The driver to show after the server named one. The same driver: what the
 * screen knew, with the server's fields on top. Another driver: that driver
 * alone; nothing (fare, phone, ETA) of the one shown before carries over.
 */
export function carryDriver<D extends DriverLike>(previous: D | undefined, next: D | undefined): D | undefined {
  if (!next) return undefined;
  if (!previous || previous.driverId !== next.driverId) return next;
  const defined = Object.fromEntries(Object.entries(next).filter(([, value]) => value !== undefined));
  return { ...previous, ...defined } as D;
}

type SearchLike = {
  rideId: string;
  status: string;
  bidsCloseAt?: string;
  bidTimeout?: boolean;
  riderOfferNgn?: number;
  offers?: RideOffer[];
  autoAcceptSupported?: boolean;
  autoAcceptChosen?: boolean;
  driver?: DriverLike;
  tripCode?: string;
  startedAt?: string;
  fareEstimateNgn?: number;
};

/**
 * A search on screen ('requesting' or 'bidding') squared with the server,
 * after the socket was away (a reconnect, the app back in front): the trip
 * if a driver was booked meanwhile, the open offers if it is still a search,
 * "nobody took it" once its time is over and the server has nothing. Anything
 * the server cannot say for sure leaves the screen as it is.
 */
export function reconcileSearch<T extends SearchLike>(
  previous: T,
  answer: ServerAnswer,
  now = Date.now(),
  /** What the socket said while the server was being asked: replayed over its answer. */
  sinceFetch: OfferEvent[] = [],
): T {
  if (previous.status !== 'bidding' && previous.status !== 'requesting') return previous;
  if (answer.kind === 'unknown') return previous;
  if (answer.kind === 'none') {
    // Just sent: the server may not have written it yet.
    if (previous.status !== 'bidding' || previous.bidTimeout) return previous;
    const closes = previous.bidsCloseAt ? Date.parse(previous.bidsCloseAt) : Number.NaN;
    if (!Number.isFinite(closes) || closes > now) return previous;
    return { ...previous, bidTimeout: true, offers: [] };
  }
  const ride = answer.ride;
  if (ride.rideId !== previous.rideId) return previous;
  if (ride.status === 'bidding') {
    const offers = offersAfterServerList(previous.offers ?? [], ride.offers as RideOffer[] | undefined, sinceFetch);
    return {
      ...previous,
      status: 'bidding',
      bidTimeout: false,
      autoAcceptSupported: true,
      autoAcceptChosen: ride.autoAcceptChosen ?? previous.autoAcceptChosen,
      bidsCloseAt: ride.bidsCloseAt ?? previous.bidsCloseAt,
      riderOfferNgn: ride.riderOfferNgn ?? previous.riderOfferNgn,
      offers,
    } as T;
  }
  // Booked while the app was not listening (auto-accept, or an accept that went through).
  return {
    ...previous,
    status: ride.status,
    bidTimeout: false,
    offers: [],
    tripCode: ride.tripCode ?? previous.tripCode,
    startedAt: ride.startedAt ?? previous.startedAt,
    fareEstimateNgn: ride.fareEstimateNgn ?? previous.fareEstimateNgn,
    driver: carryDriver(previous.driver, ride.driver as DriverLike | undefined),
  } as T;
}
