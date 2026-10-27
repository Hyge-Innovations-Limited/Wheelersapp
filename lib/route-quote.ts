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

/** What asking for a quote came to: the quote, or a server too old to price routes. */
export type RouteQuoteAnswer = { kind: 'quote'; quote: RouteQuote } | { kind: 'unpriced' };

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

/** The quote's answer from a reply, or null when the reply is not one (keep waiting). */
export function routeQuoteAnswerFrom(
  type: string,
  payload: Record<string, unknown>,
  rideId: string,
): RouteQuoteAnswer | null {
  if (isUnknownQuoteType(type, payload)) return { kind: 'unpriced' };
  if (type !== 'ride:route:quote:result') return null;
  if (typeof payload.rideId === 'string' && payload.rideId && payload.rideId !== rideId) return null;
  const quote = routeQuoteFrom(payload);
  return quote ? { kind: 'quote', quote } : null;
}

/** What a route change sent with a price came to. */
export type RouteUpdateResult = { kind: 'done' } | { kind: 'price_changed'; quote: RouteQuote };
