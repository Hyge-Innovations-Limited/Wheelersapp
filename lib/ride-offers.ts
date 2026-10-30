/**
 * The rules of the auction, as plain functions.
 *
 * These live outside `ride-session.tsx` because they are the part of matching
 * that can actually be wrong in a way a rider would notice — a driver listed
 * twice, a stale counter-offer still showing against a price that has since
 * changed, the cheapest bid buried at the bottom — and a React context is a
 * poor place to keep logic you want to prove.
 */

import { carryProfile, type DriverProfile } from '@/lib/driver-photo';

export type RideOffer = DriverProfile & {
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

  const existing = offers.find((offer) => offer.driverId === incoming.driverId);
  return [...others, { ...incoming, ...carryProfile(incoming, existing), riderCounterNgn: undefined }].sort(
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

/**
 * The offers back on screen after an accept did not go through. Not the list
 * as it was at Accept: that one brings back old prices, and drivers who have
 * withdrawn since. The list at Accept (already without anyone who withdrew
 * since) with every offer received since folded in, the newest price per
 * driver winning; `drop` (a driver who is gone) leaves.
 */
export function offersAfterRefusedAccept(
  heldAtAccept: RideOffer[] | null | undefined,
  sinceAccept: RideOffer[] | null | undefined,
  drop?: string,
): RideOffer[] {
  let merged = [...(heldAtAccept ?? [])];
  for (const offer of sinceAccept ?? []) merged = mergeOffer(merged, offer);
  return drop ? merged.filter((offer) => offer.driverId !== drop) : merged;
}

/** One driver's price, as the server now has it (an accept refused as 'offer_changed'). */
export function withOfferPrice(offers: RideOffer[], driverId: string | undefined, priceNgn: number | undefined): RideOffer[] {
  if (!driverId || typeof priceNgn !== 'number' || !Number.isFinite(priceNgn) || priceNgn <= 0) return offers;
  const current = offers.find((offer) => offer.driverId === driverId);
  if (!current || current.counterOfferNgn === priceNgn) return offers;
  return mergeOffer(offers, { ...current, counterOfferNgn: priceNgn });
}

/**
 * The server's list of open offers, as truth: its prices, nobody who has
 * withdrawn. A counter the rider is still waiting on stays shown while that
 * driver's price has not moved.
 */
export function offersFromServer(onScreen: RideOffer[], fromServer: RideOffer[]): RideOffer[] {
  return fromServer
    .map((offer) => {
      const shown = onScreen.find((item) => item.driverId === offer.driverId);
      return shown && shown.counterOfferNgn === offer.counterOfferNgn && shown.riderCounterNgn !== undefined
        ? { ...offer, riderCounterNgn: shown.riderCounterNgn }
        : { ...offer, riderCounterNgn: undefined };
    })
    .sort((a, b) => a.counterOfferNgn - b.counterOfferNgn || a.etaSeconds - b.etaSeconds);
}

/** The server still has the search open with the chosen driver's offer on it: the booking may still be going through. */
export function stillOpenForChosen(
  restored: { status?: string; offers?: { driverId: string }[] } | null | undefined,
  chosenDriverId: string,
): boolean {
  return restored?.status === 'bidding' && (restored.offers ?? []).some((offer) => offer.driverId === chosenDriverId);
}

/** An offer arriving or leaving on the socket, with when: replayed over a server list fetched meanwhile. */
export type OfferEvent =
  | { at: number; kind: 'add'; offer: RideOffer }
  | { at: number; kind: 'remove'; driverId: string };

/**
 * The server's list of open offers, squared with what the socket said while
 * it was being fetched: an offer that arrived meanwhile stays, one withdrawn
 * or declined meanwhile does not come back. An empty list from the server
 * while the screen has offers says nothing for sure (a passing error answers
 * with none): the screen keeps its own.
 */
export function offersAfterServerList(
  onScreen: RideOffer[],
  fromServer: RideOffer[] | null | undefined,
  sinceFetch: OfferEvent[],
): RideOffer[] {
  if (!fromServer || (fromServer.length === 0 && onScreen.length > 0)) return onScreen;
  let offers = offersFromServer(onScreen, fromServer);
  for (const event of sinceFetch) {
    offers = event.kind === 'add' ? mergeOffer(offers, event.offer) : dismissOffer(offers, event.driverId);
  }
  return offers;
}
