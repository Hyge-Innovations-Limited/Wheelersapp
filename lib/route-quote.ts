/**
 * Changing where a booked trip goes, priced first: the server quotes the new
 * fare and how much more (or less) the wallet would hold, and the rider says
 * yes before anything moves. Pure, so the screen and the tests agree.
 */

import { naira } from '@/constants/rider-theme';

export type RouteQuote = { fareNgn: number; extraNgn: number };

/** `ride:route:quote:result` / a PRICE_CHANGED refusal, as a quote; null when it is not one. */
export function routeQuoteFrom(payload: Record<string, unknown>): RouteQuote | null {
  const fare = payload.fareNgn;
  const extra = payload.extraNgn;
  if (typeof fare !== 'number' || !Number.isFinite(fare) || fare <= 0) return null;
  return { fareNgn: Math.round(fare), extraNgn: typeof extra === 'number' && Number.isFinite(extra) ? Math.round(extra) : 0 };
}

/** The money moves (more held, or some back): the rider is asked first. */
export function routeQuoteNeedsAsk(quote: RouteQuote): boolean {
  return quote.extraNgn !== 0;
}

/** "₦800 more will be held", "₦500 back to your wallet", or null when nothing moves. */
export function routeQuoteLine(quote: RouteQuote): string | null {
  if (quote.extraNgn > 0) return `${naira(quote.extraNgn)} more will be held`;
  if (quote.extraNgn < 0) return `${naira(-quote.extraNgn)} back to your wallet`;
  return null;
}

/** What asking for a quote came to: the quote, a refusal to show, or a server too old to price routes. */
export type RouteQuoteAnswer =
  | { kind: 'quote'; quote: RouteQuote }
  | { kind: 'refused'; message: string }
  | { kind: 'unpriced' };

/** Said when the route could not be priced (an error, no answer): nothing is sent. */
export const ROUTE_NOT_PRICED = 'Could not price that route. Try again.';

/**
 * The error an older server answers with for a message it does not know.
 * Only that one means "this server does not price routes": the change then
 * goes as it always did. Any other error says nothing of the sort.
 */
export function isUnknownQuoteType(type: string, payload: Record<string, unknown>): boolean {
  return type === 'error' && payload.message === 'Unknown event type: ride:route:quote';
}

/** A refusal of the quote itself ("That is the route you already have."): its message, to show. */
export function routeQuoteRefusalFrom(type: string, payload: Record<string, unknown>): string | null {
  if (type !== 'error' || payload.requestType !== 'ride:route:quote') return null;
  if (isUnknownQuoteType(type, payload)) return null;
  return typeof payload.message === 'string' && payload.message ? payload.message : ROUTE_NOT_PRICED;
}

/** The quote's answer from a reply, or null when the reply is not one (keep waiting). */
export function routeQuoteAnswerFrom(
  type: string,
  payload: Record<string, unknown>,
  rideId: string,
): RouteQuoteAnswer | null {
  if (isUnknownQuoteType(type, payload)) return { kind: 'unpriced' };
  const refusal = routeQuoteRefusalFrom(type, payload);
  if (refusal) return { kind: 'refused', message: refusal };
  if (type !== 'ride:route:quote:result') return null;
  if (typeof payload.rideId === 'string' && payload.rideId && payload.rideId !== rideId) return null;
  const quote = routeQuoteFrom(payload);
  return quote ? { kind: 'quote', quote } : null;
}

/** The wallet cannot cover the new fare: the change waits (server side) until the money lands. */
export type RouteWalletShort = {
  quote: RouteQuote;
  neededNgn: number;
  /** What to send, fee included: shown as "Add ₦X" (the server's `sendNgn`, else `neededNgn`). */
  sendNgn: number;
  balanceNgn: number;
  /** ISO time the server stops keeping the change. */
  pendingUntil: string | null;
};

/** What a route change sent with a price came to. */
export type RouteUpdateResult =
  | { kind: 'done' }
  | { kind: 'price_changed'; quote: RouteQuote }
  | ({ kind: 'wallet_short' } & RouteWalletShort);

/** What the server said to a priced route update, or null when the reply is not an answer to it. */
export type RouteUpdateReply =
  | { kind: 'done'; inProgress: boolean }
  | { kind: 'price_changed'; quote: RouteQuote }
  | ({ kind: 'wallet_short' } & RouteWalletShort)
  | { kind: 'refused'; message: string };

/** Said when a priced route change got no answer: nothing is shown as done. */
export const ROUTE_UPDATE_FAILED = 'Could not update the route. Try again.';
/** The add-money sheet's lines (the webview says the same). */
export const ROUTE_WAITING_LINE = 'Waiting for your transfer\u2026';
/** Alert title when a waiting change was dropped or ran out; no body. */
export const ROUTE_NOT_CHANGED = 'Route not changed';

const UPDATE_TYPES = ['ride:route:update:accepted', 'ride:route:updated', 'ride:route:update:rejected'];

/** An `error` that answered the route update itself (other requests' errors are not ours). */
function isUpdateError(type: string, payload: Record<string, unknown>): boolean {
  return type === 'error' && payload.requestType === 'ride:route:update';
}

/** Whether a message is an answer a priced route update waits for. */
export function routeUpdateWaitMatches(type: string, payload: Record<string, unknown>): boolean {
  return UPDATE_TYPES.includes(type) || isUpdateError(type, payload);
}

/** The message types a priced route update waits for (the error is filtered by `routeUpdateWaitMatches`). */
export const ROUTE_UPDATE_WAIT_TYPES = [...UPDATE_TYPES, 'error'];

export function routeUpdateReplyFrom(type: string, payload: Record<string, unknown>): RouteUpdateReply | null {
  if (type === 'ride:route:updated') return { kind: 'done', inProgress: false };
  if (type === 'ride:route:update:accepted') return { kind: 'done', inProgress: payload.inProgress === true };
  if (isUpdateError(type, payload)) {
    return { kind: 'refused', message: typeof payload.message === 'string' && payload.message ? payload.message : ROUTE_UPDATE_FAILED };
  }
  if (type !== 'ride:route:update:rejected') return null;
  const quote = routeQuoteFrom(payload);
  if (payload.reason === 'PRICE_CHANGED' && quote) return { kind: 'price_changed', quote };
  if (payload.reason === 'WALLET_SHORT' && quote) {
    const needed = payload.neededNgn;
    const send = payload.sendNgn;
    const balance = payload.balanceNgn;
    if (typeof needed === 'number' && Number.isFinite(needed) && needed > 0) {
      const neededNgn = Math.ceil(needed);
      return {
        kind: 'wallet_short',
        quote,
        neededNgn,
        sendNgn: typeof send === 'number' && Number.isFinite(send) && send > 0 ? Math.ceil(send) : neededNgn,
        balanceNgn: typeof balance === 'number' && Number.isFinite(balance) ? Math.round(balance) : 0,
        pendingUntil: typeof payload.pendingUntil === 'string' ? payload.pendingUntil : null,
      };
    }
  }
  return {
    kind: 'refused',
    message: typeof payload.message === 'string' && payload.message ? payload.message : 'Could not update the ride route.',
  };
}

/** The update's reply as an answer, or the failure when none came in time (null reply). */
export function routeUpdateAnswerFrom(reply: { type: string; payload: Record<string, unknown> } | null): RouteUpdateReply {
  const answer = reply ? routeUpdateReplyFrom(reply.type, reply.payload) : null;
  return answer ?? { kind: 'refused', message: ROUTE_UPDATE_FAILED };
}

/** After "in progress": ride:route:updated must come; an error or no answer is a failure. Returns a message on failure, null on success. */
export function routeInProgressFailure(reply: { type: string; payload: Record<string, unknown> } | null): string | null {
  if (reply && reply.type === 'ride:route:updated') return null;
  if (reply && isUpdateError(reply.type, reply.payload)) {
    return typeof reply.payload.message === 'string' && reply.payload.message ? reply.payload.message : ROUTE_UPDATE_FAILED;
  }
  return ROUTE_UPDATE_FAILED;
}

type LatLng = { lat: number; lng: number };
export type RequestedRoute = { destination: LatLng; stops: LatLng[] };

function samePlace(a: unknown, b: LatLng): boolean {
  if (!a || typeof a !== 'object') return false;
  const { lat, lng } = a as Record<string, unknown>;
  return typeof lat === 'number' && typeof lng === 'number' && Math.abs(lat - b.lat) < 1e-4 && Math.abs(lng - b.lng) < 1e-4;
}

/** Whether a `ride:route:updated` is the requested route (a driver's "stop reached" is not). */
export function routeUpdatedIsRequested(payload: Record<string, unknown>, requested: RequestedRoute): boolean {
  const stops = payload.stops;
  if (!Array.isArray(stops) || stops.length !== requested.stops.length) return false;
  return samePlace(payload.destination, requested.destination) && requested.stops.every((stop, i) => samePlace(stops[i], stop));
}

/** Waiting for the in-progress change's `ride:route:updated` for the requested route (or an error for the update). */
export function routeInProgressWaitMatches(type: string, payload: Record<string, unknown>, requested?: RequestedRoute): boolean {
  if (type === 'ride:route:updated') return requested ? routeUpdatedIsRequested(payload, requested) : true;
  return isUpdateError(type, payload);
}

/**
 * How the waiting route change ended on its own: the deposit applied it, the trip changed and it was dropped,
 * or the car moved on and the price moved too much (asked about again at the new price).
 */
export type RouteOutcome = { kind: 'applied' } | { kind: 'dropped' } | { kind: 'price_changed'; quote: RouteQuote };

/**
 * A message that settles a route change waiting on money; null for anything else, and for another ride's
 * message (when `activeRideId` is known and the message names a different ride).
 */
export function routeOutcomeFrom(type: string, payload: Record<string, unknown>, activeRideId?: string): RouteOutcome | null {
  if (activeRideId && typeof payload.rideId === 'string' && payload.rideId && payload.rideId !== activeRideId) return null;
  if (type === 'ride:route:update:dropped') return { kind: 'dropped' };
  if (type === 'ride:route:update:accepted' && (payload.appliedAfterDeposit === true || payload.alreadyApplied === true)) {
    return { kind: 'applied' };
  }
  if (type === 'ride:route:update:rejected' && payload.reason === 'PRICE_CHANGED') {
    const quote = routeQuoteFrom(payload);
    return quote ? { kind: 'price_changed', quote } : null;
  }
  return null;
}

/** Waiting for the answer to backing out of a waiting change. */
export function pendingCancelWaitMatches(type: string, payload: Record<string, unknown>): boolean {
  return type === 'ride:route:pending:cancelled' || (type === 'error' && payload.requestType === 'ride:route:pending:cancel');
}

export const PENDING_CANCEL_FAILED = 'Could not go back. Try again.';

/** The answer to backing out: cancelled true (trip stays), false (a deposit applied it), or failed (error or no answer). */
export type PendingCancelAnswer = { kind: 'cancelled'; cancelled: boolean } | { kind: 'failed'; message: string };

export function pendingCancelAnswerFrom(reply: { type: string; payload: Record<string, unknown> } | null): PendingCancelAnswer {
  if (reply && reply.type === 'ride:route:pending:cancelled') return { kind: 'cancelled', cancelled: reply.payload.cancelled === true };
  if (reply && reply.type === 'error' && reply.payload.requestType === 'ride:route:pending:cancel') {
    return { kind: 'failed', message: typeof reply.payload.message === 'string' && reply.payload.message ? reply.payload.message : PENDING_CANCEL_FAILED };
  }
  return { kind: 'failed', message: PENDING_CANCEL_FAILED };
}

/** The trip's new fare carried by `ride:route:updated`, or null (an older server sends none). */
export function routeUpdatedFareFrom(payload: Record<string, unknown>): number | null {
  const fare = payload.fareNgn;
  return typeof fare === 'number' && Number.isFinite(fare) && fare > 0 ? Math.round(fare) : null;
}

/** Whether a waiting change has run out of time (the server keeps it until `pendingUntil`). */
export function routePendingExpired(pendingUntil: string | null, now: number): boolean {
  if (!pendingUntil) return false;
  const at = Date.parse(pendingUntil);
  return Number.isFinite(at) && now >= at;
}
