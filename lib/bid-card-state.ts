import type { PendingBid } from "@/lib/driver-session-reducer";

/**
 * Where a driver's bid stands, in one word, and what that looks like. The
 * request feed and the bid screen both read this, so they never disagree:
 *
 *   waiting    white   sent, the rider has not answered
 *   countered  orange  the rider came back with another price
 *   paying     yellow  the rider chose this driver and is adding money
 *   accepted   green   the rider accepted (and paid, on wallet rides)
 *   declined   red     the rider declined every offer — still live: the
 *                      driver can send a new bid, which makes it white again.
 *                      If the rider then names a new price it is shown live,
 *                      orange, "New price" (repricedAfterDecline)
 *   lost / expired / withdrawn   grey, finished
 */
export type BidStage =
  | "waiting"
  | "countered"
  | "paying"
  | "accepted"
  | "declined"
  | "lost"
  | "expired"
  | "withdrawn";

export function bidStage(bid: PendingBid): BidStage {
  if (bid.acceptedAt) return "accepted";
  if (bid.outcome) return bid.outcome;
  if (bid.declinedAt) return "declined";
  if (bid.payingAt) return "paying";
  const riderAsk = bid.offer.riderOfferNgn ?? bid.offer.fareEstimateNgn;
  if (bid.counteredAt && riderAsk !== bid.amountNgn) return "countered";
  return "waiting";
}

/**
 * The rider declined this driver's offer and THEN named a new price. That is
 * the rider coming back, not a dead card: it shows live again ("New price"),
 * with the bid form, until the driver answers or the rider declines again.
 * A decline with no new price since stays red.
 */
export function repricedAfterDecline(bid: PendingBid): boolean {
  if (!bid.declinedAt || !bid.counteredAt || bid.outcome || bid.acceptedAt) return false;
  return Date.parse(bid.counteredAt) > Date.parse(bid.declinedAt);
}

/** The driver took the rider's own price: there is nothing to change, so no "Change bid". */
export function tookRidersPrice(bid: PendingBid): boolean {
  const riderAsk = bid.offer.riderOfferNgn ?? bid.offer.fareEstimateNgn;
  return riderAsk === bid.amountNgn;
}

/** The server's status for a bid that has ENDED, as the card's outcome. (DECLINED has not ended.) */
export function outcomeFromServerStatus(status: string): NonNullable<PendingBid["outcome"]> {
  if (status === "LOST") return "lost";
  if (status === "EXPIRED") return "expired";
  return "withdrawn";
}

/**
 * The finished line on a card. With the server's reason (newer servers):
 * "Rider cancelled", "Search ended", "Not chosen"; without it, as before.
 */
export function outcomeLabel(
  outcome: NonNullable<PendingBid["outcome"]>,
  endReason?: PendingBid["endReason"],
): string {
  if (endReason === "rider_cancelled") return "Rider cancelled";
  if (endReason === "timed_out") return "Search ended";
  if (endReason === "booked_other") return "Not chosen";
  switch (outcome) {
    case "lost": return "Taken by another driver";
    case "withdrawn": return "Offer withdrawn";
    default: return "Request ended";
  }
}
