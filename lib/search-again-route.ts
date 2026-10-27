import { serializeRideItinerary, type RideItinerary } from "@/lib/ride-route";

/**
 * Where a rider on a trip screen goes when their booked driver pulled out and
 * the search goes on (ride:cancelled with searchingAgain puts the ride back to
 * 'bidding'): Finding drivers for the same ride, at the same price. Null for
 * anything else; a plain cancel ('cancelled') keeps its own handling.
 */
export function searchAgainRoute(
  ride: { status?: string; itinerary: RideItinerary; riderOfferNgn?: number } | null | undefined,
): { pathname: "/matching"; params: { itinerary: string; offer?: string } } | null {
  if (!ride || ride.status !== "bidding") return null;
  const itinerary = serializeRideItinerary(ride.itinerary);
  return {
    pathname: "/matching",
    params:
      typeof ride.riderOfferNgn === "number" && Number.isFinite(ride.riderOfferNgn)
        ? { itinerary, offer: String(ride.riderOfferNgn) }
        : { itinerary },
  };
}

/**
 * The ride went from a booked driver (matched, or the trip under way) back to
 * a search: the driver pulled out. Only this transition sends a trip screen
 * to Finding drivers; a trip screen opened while the ride is still a search
 * (a "Driver found!" tap before the app has heard of the booking) stays put.
 */
export function isDriverBail(previousStatus: string | undefined, status: string | undefined): boolean {
  return status === "bidding" && (previousStatus === "matched" || previousStatus === "active");
}
