/**
 * The rules of the auction, as plain functions.
 *
 * These live outside `ride-session.tsx` because they are the part of matching
 * that can actually be wrong in a way a rider would notice — a driver listed
 * twice, a stale counter-offer still showing against a price that has since
 * changed, the cheapest bid buried at the bottom — and a React context is a
 * poor place to keep logic you want to prove.
 */

export type RideOffer = {
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
  /** Set while the rider's own counter to this driver is unanswered. */
  riderCounterNgn?: number;
};

/**
 * Fold a driver's bid into the list.
 *
 * A driver who re-bids replaces their own entry rather than appearing twice,
 * and the new price clears whatever counter the rider was still waiting on —
 * "you offered ₦3,000" against a number the driver has already moved is worse
 * than showing nothing.
 *
 * Sorted cheapest first, ties broken by who is closer, so the top of the list
 * is always the offer a rider would pick if they only read one.
 */
export function mergeOffer(offers: RideOffer[], incoming: RideOffer): RideOffer[] {
  const others = offers.filter((offer) => offer.driverId !== incoming.driverId);

  return [...others, { ...incoming, riderCounterNgn: undefined }].sort(
    (a, b) =>
      a.counterOfferNgn - b.counterOfferNgn || a.etaSeconds - b.etaSeconds,
  );
}

/** Mark the rider's counter to one driver as sent and awaiting a reply. */
export function applyRiderCounter(
  offers: RideOffer[],
  driverId: string,
  amountNgn: number,
): RideOffer[] {
  return offers.map((offer) =>
    offer.driverId === driverId ? { ...offer, riderCounterNgn: amountNgn } : offer,
  );
}

/**
 * Take a declined bid off the list. The driver is told (ride:decline_offer)
 * and is free to come back with a new price — which `mergeOffer` will then let
 * back into the list.
 */
export function dismissOffer(offers: RideOffer[], driverId: string): RideOffer[] {
  return offers.filter((offer) => offer.driverId !== driverId);
}

/** The bid a rider would take if they only looked at one. */
export function bestOffer(offers: RideOffer[]): RideOffer | null {
  return offers[0] ?? null;
}
