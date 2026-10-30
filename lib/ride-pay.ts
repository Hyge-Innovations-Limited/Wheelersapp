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
export type PaySheetStep =
  | { kind: 'pay'; fareNgn: number }
  /** `feeIncluded`: shortNgn is already what to send (the server worked out the deposit charges). */
  | { kind: 'add'; fareNgn: number; shortNgn: number; feeIncluded?: boolean };

/**
 * The figure on "Add ₦X": what to SEND, so the shortfall lands after the
 * deposit charges. The server's answer when there is one; the bare shortfall
 * otherwise (an older server), never less than the shortfall.
 */
export function addAmountNgn(shortNgn: number, previewSendNgn: number | null | undefined): number {
  return typeof previewSendNgn === 'number' && Number.isFinite(previewSendNgn) && previewSendNgn >= shortNgn
    ? Math.ceil(previewSendNgn)
    : shortNgn;
}

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

/**
 * Before a search goes out: ask "Auto-book a driver at ₦X?" only when the
 * wallet (fetched fresh) covers the price, and never for a ride for later.
 * Unknown or short balance: no question, and no auto-booking.
 */
export function shouldAskAutoBook(input: { balanceNgn: number | null | undefined; priceNgn: number | null | undefined; scheduled: boolean }): boolean {
  return !input.scheduled && walletCovers(input.balanceNgn, input.priceNgn);
}

/** "A driver at ₦X is booked for you": only when the rider said yes for this search, the server books by itself, and the wallet covers the price. */
export function autoBookLineShows(input: {
  autoAcceptChosen: boolean | undefined;
  autoAcceptSupported: boolean | undefined;
  balanceNgn: number | null | undefined;
  priceNgn: number | null | undefined;
}): boolean {
  return input.autoAcceptChosen === true && input.autoAcceptSupported === true && walletCovers(input.balanceNgn, input.priceNgn);
}

/** The "autoAccept" route param: "1" yes, anything else no. */
export function autoAcceptParam(value: string | string[] | undefined): boolean {
  return (Array.isArray(value) ? value[0] : value) === '1';
}

/** The "autoAccept" route param as an answer: true, false, or null when the screen was opened without asking (Home, a restart). */
export function autoAcceptAnswerParam(value: string | string[] | undefined): boolean | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === '1' ? true : raw === '0' ? false : null;
}

/** A higher price on a search the rider said yes to auto-booking: asked about again before it goes out. */
export function raiseNeedsAutoBookAnswer(input: {
  autoAcceptChosen: boolean | undefined;
  agreedNgn: number | undefined;
  newNgn: number;
}): boolean {
  return input.autoAcceptChosen === true && (typeof input.agreedNgn !== 'number' || input.newNgn > input.agreedNgn);
}
