/**
 * The rider's "Finding drivers" screen: how many drivers saw the price, the
 * clock to the end of the search, and when to nudge a raise. Pure, so the
 * screen and the tests read the same rules.
 */

/** After this long with no offer, the screen suggests raising the price. */
export const RAISE_NUDGE_AFTER_MS = 2 * 60_000;

/**
 * What is happening with the search, as the server says it (Timi, 21 Nov 2026): "No drivers near you right now",
 * "4 drivers have your request", "3 drivers passed at ₦2,800", "2 drivers asked ₦3,900 – ₦4,300". The server's
 * rides/search-situation.ts; the ride page and WhatsApp say the same.
 */
export type SearchSituationKind = 'looking' | 'none_near' | 'on_trips' | 'waiting' | 'passed' | 'countered' | 'offers';
export type SearchSituation = {
  kind: SearchSituationKind;
  title: string;
  line: string;
  /** passed: a price to offer; countered: the lowest asked. */
  suggestNgn: number | null;
};
/** How a search ended (ride:bid_timeout `ended`): the end screen's title and the prices worth trying (may be none). */
export type SearchEnded = { kind: SearchSituationKind; title: string; retryNgn: number[] };

const KINDS = new Set<SearchSituationKind>(['looking', 'none_near', 'on_trips', 'waiting', 'passed', 'countered', 'offers']);
const isKind = (value: unknown): value is SearchSituationKind => typeof value === 'string' && KINDS.has(value as SearchSituationKind);
const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

/** The server's `situation`; null when absent or not understood (the screen says what it said before). */
export function parseSearchSituation(raw: unknown): SearchSituation | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!isKind(r.kind)) return null;
  const suggest = typeof r.suggestNgn === 'number' && Number.isFinite(r.suggestNgn) && r.suggestNgn > 0 ? Math.round(r.suggestNgn) : null;
  return { kind: r.kind, title: text(r.title), line: text(r.line), suggestNgn: suggest };
}

/** The server's `ended`; null when absent (the end screen says "No driver accepted ₦X", as before). */
export function parseSearchEnded(raw: unknown): SearchEnded | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!isKind(r.kind) || r.kind === 'offers' || !text(r.title)) return null;
  const retry = Array.isArray(r.retryNgn) ? r.retryNgn.filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0).map(Math.round) : [];
  return { kind: r.kind, title: text(r.title), retryNgn: [...new Set(retry)] };
}

/** The price the situation card offers ("Offer ₦3,500", "Match ₦3,900"); null when none would help. */
export function situationPrice(situation: SearchSituation | null | undefined, riderOfferNgn: number | undefined): { label: string; amountNgn: number } | null {
  if (!situation || (situation.kind !== 'passed' && situation.kind !== 'countered')) return null;
  const amount = situation.suggestNgn;
  if (!amount || (riderOfferNgn !== undefined && amount <= riderOfferNgn)) return null;
  return { label: `${situation.kind === 'countered' ? 'Match' : 'Offer'} ₦${amount.toLocaleString('en-NG')}`, amountNgn: amount };
}

/** The end screen's prices: the server's (only when they would help), else +5/10/15% as before. */
export function endedRetryPrices(ended: SearchEnded | null | undefined, riderOfferNgn: number | undefined, raises: number[]): number[] {
  if (riderOfferNgn === undefined) return [];
  if (ended) return ended.retryNgn.filter((price) => price > riderOfferNgn);
  return Array.from(new Set(raises.map((raise) => Math.round((riderOfferNgn * raise) / 50) * 50))).filter((price) => price > riderOfferNgn);
}

type SearchFields = { rideId: string; driversNotified?: number | null; bidsCloseAt?: string; situation?: SearchSituation | null };

/**
 * `ride:search_status` { rideId, driversNotified, bidsCloseAt } from newer
 * servers. Only for the ride on screen; a missing or bad field keeps what was
 * there. Returns the same object when nothing changes.
 */
export function applySearchStatus<T extends SearchFields>(ride: T | null, payload: Record<string, unknown>): T | null {
  if (!ride || payload.rideId !== ride.rideId) return ride;
  const count = payload.driversNotified;
  const driversNotified =
    typeof count === 'number' && Number.isFinite(count) && count >= 0
      ? Math.floor(count)
      : count === null
        ? null
        : ride.driversNotified;
  const close = payload.bidsCloseAt;
  const bidsCloseAt =
    typeof close === 'string' && Number.isFinite(Date.parse(close)) ? close : ride.bidsCloseAt;
  const situation = 'situation' in payload ? parseSearchSituation(payload.situation) ?? ride.situation : ride.situation;
  if (driversNotified === ride.driversNotified && bidsCloseAt === ride.bidsCloseAt && situation === ride.situation) return ride;
  return { ...ride, driversNotified, bidsCloseAt, situation };
}

/** "5 drivers saw your price", "1 driver saw your price"; null when unknown or none. */
export function driversSawLine(driversNotified: number | null | undefined): string | null {
  if (typeof driversNotified !== 'number' || !Number.isFinite(driversNotified) || driversNotified <= 0) return null;
  const n = Math.floor(driversNotified);
  return `${n} ${n === 1 ? 'driver' : 'drivers'} saw your price`;
}

/** "4:32" until the search closes; null when there is no close time or it has passed. */
export function searchClock(bidsCloseAt: string | null | undefined, nowMs: number): string | null {
  if (!bidsCloseAt) return null;
  const closes = Date.parse(bidsCloseAt);
  if (!Number.isFinite(closes)) return null;
  const left = Math.ceil((closes - nowMs) / 1000);
  if (left <= 0) return null;
  return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
}

/** Two minutes at this price and no offer yet: time to suggest a raise. */
export function shouldNudgeRaise(input: { pricedAtMs: number | null; nowMs: number; offerCount: number }): boolean {
  if (input.pricedAtMs === null || input.offerCount > 0) return false;
  return input.nowMs - input.pricedAtMs >= RAISE_NUDGE_AFTER_MS;
}
