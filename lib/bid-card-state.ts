import type { PendingBid } from "@/lib/driver-session-reducer";

/**
 * Where a driver's bid stands, in one word, and what that looks like. The
 * request feed and the bid screen both read this, so they never disagree:
 *
 *   waiting    white   sent, the rider has not answered
 *   countered  orange  the rider came back with another price
 *   paying     yellow  the rider chose this driver and is adding money
 *   accepted   green   the rider accepted (and paid, on wallet rides)
 *   declined   red     the rider declined every offer
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
  if (bid.payingAt) return "paying";
  const riderAsk = bid.offer.riderOfferNgn ?? bid.offer.fareEstimateNgn;
  if (bid.counteredAt && riderAsk !== bid.amountNgn) return "countered";
  return "waiting";
}

/** The driver took the rider's own price: there is nothing to change, so no "Change bid". */
export function tookRidersPrice(bid: PendingBid): boolean {
  const riderAsk = bid.offer.riderOfferNgn ?? bid.offer.fareEstimateNgn;
  return riderAsk === bid.amountNgn;
}

/** The server's bid status, as the card's outcome. */
export function outcomeFromServerStatus(status: string): NonNullable<PendingBid["outcome"]> {
  if (status === "LOST") return "lost";
  if (status === "EXPIRED") return "expired";
  if (status === "DECLINED") return "declined";
  return "withdrawn";
}

/** The finished line on a card. */
export function outcomeLabel(outcome: NonNullable<PendingBid["outcome"]>): string {
  switch (outcome) {
    case "lost": return "Taken by another driver";
    case "declined": return "Declined";
    case "withdrawn": return "Your offer was withdrawn";
    default: return "Request ended";
  }
}
