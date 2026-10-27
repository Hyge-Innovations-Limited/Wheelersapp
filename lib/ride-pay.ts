/**
 * Paying for a driver's offer from the wallet (the pay sheet), and whether
 * the wallet covers auto-accept. Pure, so the screen and the tests agree.
 */

/**
 * How much more the wallet needs for this fare, in whole naira (rounded up).
 * 0 when it already covers it, and 0 when the balance is not known yet: the
 * server checks it again on accept and says so if it is short.
 */
export function walletShortNgn(balanceNgn: number | null | undefined, fareNgn: number | null | undefined): number {
  if (typeof balanceNgn !== 'number' || !Number.isFinite(balanceNgn)) return 0;
  if (typeof fareNgn !== 'number' || !Number.isFinite(fareNgn) || fareNgn <= 0) return 0;
  return balanceNgn >= fareNgn ? 0 : Math.ceil(fareNgn - balanceNgn);
}

/** What the pay sheet shows: pay now, or add money first. */
export type PaySheetStep = { kind: 'pay'; fareNgn: number } | { kind: 'add'; fareNgn: number; shortNgn: number };

export function paySheetStep(balanceNgn: number | null | undefined, fareNgn: number): PaySheetStep {
  const shortNgn = walletShortNgn(balanceNgn, fareNgn);
  return shortNgn > 0 ? { kind: 'add', fareNgn, shortNgn } : { kind: 'pay', fareNgn };
}

/**
 * The rider tapped Accept, the wallet was short, and they stayed on the
 * sheet: the accept goes the moment the balance covers the fare. Never when
 * they backed out, never on an unknown balance.
 */
export function shouldSendAfterTopUp(input: {
  waitingForMoney: boolean;
  backedOut: boolean;
  balanceNgn: number | null | undefined;
  /** The driver's price now. */
  fareNgn: number | null | undefined;
  /** The price the rider said yes to at Accept: a re-bid since is never booked by itself. */
  agreedFareNgn: number;
  /** Only a search still open takes an accept (a driver may have been booked meanwhile). */
  rideStatus: string | undefined;
  searchEnded?: boolean;
  sending: boolean;
}): boolean {
  if (!input.waitingForMoney || input.backedOut || input.sending) return false;
  if (input.rideStatus !== 'bidding' || input.searchEnded) return false;
  if (input.fareNgn !== input.agreedFareNgn) return false;
  if (typeof input.balanceNgn !== 'number' || !Number.isFinite(input.balanceNgn)) return false;
  if (typeof input.fareNgn !== 'number' || !(input.fareNgn > 0)) return false;
  return input.balanceNgn >= input.fareNgn;
}

/** The wallet is known to cover this fare (the server then books the first driver at or under it). */
export function walletCovers(balanceNgn: number | null | undefined, fareNgn: number | null | undefined): boolean {
  if (typeof balanceNgn !== 'number' || !Number.isFinite(balanceNgn)) return false;
  if (typeof fareNgn !== 'number' || !Number.isFinite(fareNgn) || fareNgn <= 0) return false;
  return balanceNgn >= fareNgn;
}

/** An accept is only sent on a search still open: not once a driver is booked or being confirmed, nor after it ended. */
export function canAcceptOffers(ride: { status?: string; bidTimeout?: boolean } | null | undefined): boolean {
  return Boolean(ride) && ride!.status === 'bidding' && ride!.bidTimeout !== true;
}

/** What the rider reads when an accept is turned down, short; the server's own words when it knows more (the amount short). */
export function acceptRefusalText(reason: string | undefined, message: string | undefined): string {
  if (reason === 'driver_away') return "That driver's app is closed. Pick another offer.";
  if (reason === 'driver_unavailable') return 'That driver is no longer available.';
  if (reason === 'offer_changed') return 'That price changed. Check the offer again.';
  // Another booking attempt holds the ride for a moment: every offer stays.
  if (reason === 'busy') return message ?? 'Try again.';
  return message ?? 'That offer could not be booked. Pick another.';
}

/**
 * Who leaves the list when an accept is refused: the driver who is gone (app
 * closed, unavailable). Anything else ('busy': another booking attempt held
 * the ride for a moment; a short wallet; a changed price) keeps every offer.
 */
export function droppedOnRefusal(reason: string | undefined, driverId: string | undefined): string | undefined {
  return reason === 'driver_away' || reason === 'driver_unavailable' ? driverId : undefined;
}

/**
 * A refusal only counts for the driver being confirmed right now: a late one
 * (for an earlier pick, or once Confirming is over) is ignored. A refusal
 * that names no driver (older servers) counts while one is being confirmed.
 */
export function refusalIsForConfirming(
  confirmingDriverId: string | null | undefined,
  refusedDriverId: string | undefined,
): boolean {
  if (!confirmingDriverId) return false;
  return !refusedDriverId || refusedDriverId === confirmingDriverId;
}

/** "Confirming your driver" with the chosen offer still open on the server after this many 20 s checks: back to the offers. */
export const CONFIRM_STILL_OPEN_LIMIT = 2;

/** The price an accept sends: the one the rider was shown, when known; otherwise the offer's own. */
export function agreedPriceFor(offerNgn: number, shownNgn: number | null | undefined): number {
  return typeof shownNgn === 'number' && Number.isFinite(shownNgn) && shownNgn > 0 ? Math.round(shownNgn) : offerNgn;
}
