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

/** What a route change sent with a price came to. */
export type RouteUpdateResult = { kind: 'done' } | { kind: 'price_changed'; quote: RouteQuote };
