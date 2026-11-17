/**
 * A group ride offer (Timi, 16-17 Nov 2026; Wheelers-Backend rides/group-live.ts): riders searching right now
 * who are going the same way, 25% off each seat. The server decides everything; this reads and words it.
 * No React Native here (tested in __tests__/group-offer.test.mjs).
 */

export type GroupAnswer = 'join' | 'decline';

export type GroupOfferView = {
  offerId: string;
  expiresAtMs: number;
  selfieDeadlineMs: number;
  ownPriceNgn: number;
  seatPriceNgn: number;
  savedNgn: number;
  extraMinutes: number;
  people: number;
  answer: GroupAnswer | null;
  selfieNeeded: boolean;
  riders: Array<{ you: boolean; name: string; pickup: string }>;
  /** Where this rider gets out (first part of the address). */
  dropoff: string;
};

export type GroupFormed = { seatPriceNgn: number; others: string[] };

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const time = (v: unknown): number | null => {
  if (typeof v !== 'string') return null;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? ms : null;
};

/** The server's `groupOffer` (GET /rides/active search.groupOffer, or a `ride:group_offer` message's `offer`). */
export function parseGroupOffer(value: unknown): GroupOfferView | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const expiresAtMs = time(v.expiresAt);
  const seat = num(v.seatPriceNgn);
  const own = num(v.ownPriceNgn);
  if (typeof v.offerId !== 'string' || expiresAtMs === null || seat === null || own === null) return null;
  const riders = Array.isArray(v.riders)
    ? v.riders
        .map((r) => (r && typeof r === 'object' ? (r as Record<string, unknown>) : null))
        .filter((r): r is Record<string, unknown> => r !== null)
        .map((r) => ({ you: r.you === true, name: typeof r.name === 'string' ? r.name : 'Rider', pickup: typeof r.pickup === 'string' ? r.pickup : '' }))
    : [];
  const stops = Array.isArray(v.stops) ? (v.stops as Array<Record<string, unknown>>) : [];
  const drop = stops.find((s) => s && s.kind === 'dropoff' && s.you === true);
  return {
    offerId: v.offerId,
    expiresAtMs,
    selfieDeadlineMs: time(v.selfieDeadline) ?? expiresAtMs + 60_000,
    ownPriceNgn: own,
    seatPriceNgn: seat,
    savedNgn: Math.max(0, num(v.savedNgn) ?? own - seat),
    extraMinutes: Math.max(1, num(v.extraMinutes) ?? 1),
    people: num(v.people) ?? riders.length,
    answer: v.answer === 'join' || v.answer === 'decline' ? v.answer : null,
    selfieNeeded: v.selfieNeeded === true,
    riders,
    dropoff: typeof drop?.address === 'string' ? drop.address.split(',')[0]!.trim() : '',
  };
}

export function groupOfferTitle(offer: Pick<GroupOfferView, 'riders'>): string {
  const n = offer.riders.filter((r) => !r.you).length;
  return `${n} rider${n === 1 ? ' is' : 's are'} going your way`;
}

/** What the sheet shows now. */
export type GroupStep = 'ask' | 'selfie' | 'waiting' | 'declined';
export function groupStep(offer: Pick<GroupOfferView, 'answer' | 'selfieNeeded'>): GroupStep {
  if (offer.answer === 'join') return offer.selfieNeeded ? 'selfie' : 'waiting';
  if (offer.answer === 'decline') return 'declined';
  return 'ask';
}

export const formedLine = (formed: GroupFormed, naira: (n: number) => string) =>
  `You're riding together with ${formed.others.join(' and ')}. Your seat: ${naira(formed.seatPriceNgn)}. Finding your driver.`;
export const NOT_GROUPED_LINE = 'No group this time. Your search goes on.';
