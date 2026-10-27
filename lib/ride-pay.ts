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
