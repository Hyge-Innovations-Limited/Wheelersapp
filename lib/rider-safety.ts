/**
 * Rider safety (Timi, 14 Nov 2026), the app's half of Wheelers-Backend
 * rides/safety.ts and drivers/driver-checks.ts: what was checked about a
 * driver (on each offer), whether the trip is recorded, and the three tips
 * shown before and after it. The server decides all of it; this only reads
 * and words it. No React Native here (tested in __tests__/rider-safety.test.mjs).
 */

export type DriverCheckKind = 'nin' | 'licence' | 'face' | 'insurance' | 'plate';
export type DriverCheck = { kind: DriverCheckKind; at: string; until: string | null };

export const CHECK_WORDS: Record<DriverCheckKind, { chip: string; line: string }> = {
  nin: { chip: 'NIN', line: 'NIN verified' },
  licence: { chip: 'Licence', line: "Driver's licence is real" },
  face: { chip: 'Face', line: 'Face matches the licence' },
  insurance: { chip: 'Insurance', line: 'Car insurance is valid' },
  plate: { chip: 'Plate', line: 'Plate matches the car' },
};

const KINDS = Object.keys(CHECK_WORDS) as DriverCheckKind[];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The server's `checks` on an offer: only kinds this app knows, each once, in the server's order. */
export function parseChecks(value: unknown): DriverCheck[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: DriverCheck[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const c = item as Record<string, unknown>;
    if (typeof c.kind !== 'string' || !KINDS.includes(c.kind as DriverCheckKind) || seen.has(c.kind)) continue;
    if (typeof c.at !== 'string' || !Number.isFinite(Date.parse(c.at))) continue;
    seen.add(c.kind);
    out.push({ kind: c.kind as DriverCheckKind, at: c.at, until: typeof c.until === 'string' && Number.isFinite(Date.parse(c.until)) ? c.until : null });
  }
  return out;
}

/** "Oct 2026". */
export function monthOf(iso: string): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` : '';
}

/** The date beside a check in "Checked by Wheelers": when it was checked, or for insurance when it ends. */
export function checkDate(check: DriverCheck): string {
  return check.kind === 'insurance' && check.until ? `to ${monthOf(check.until)}` : monthOf(check.at);
}

export type TripSafety = { before: string[]; after: string[] };

const tipList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((t): t is string => typeof t === 'string' && t.trim().length > 0).slice(0, 3) : [];

/** `recorded` and `safety` from GET /rides/active (or a ride socket payload). */
export function safetyFields(value: unknown): { recorded?: boolean; safety?: TripSafety; safetyCards?: SafetyCards } {
  if (!value || typeof value !== 'object') return {};
  const v = value as Record<string, unknown>;
  const s = v.safety && typeof v.safety === 'object' ? (v.safety as Record<string, unknown>) : null;
  const before = tipList(s?.before);
  const after = tipList(s?.after);
  const cards = parseSafetyCards(v.safetyCards);
  return {
    ...(typeof v.recorded === 'boolean' ? { recorded: v.recorded } : {}),
    ...(before.length || after.length ? { safety: { before, after } } : {}),
    ...(cards ? { safetyCards: cards } : {}),
  };
}

/* ── The playful tip cards (21 Nov 2026), the server's packages/config safety-cards.ts ── */

export type SafetyStage = 'far' | 'wait' | 'near' | 'close' | 'here' | 'trip' | 'after';
export type SafetyTone = 'orange' | 'ink' | 'cream' | 'green' | 'sky' | 'pink';
export type SafetyCard = { key: string; emoji: string; kick: string; title: string; line: string; tone: SafetyTone };
export type SafetyCards = { byStage: Partial<Record<SafetyStage, SafetyCard>>; groups: { title: string; cards: SafetyCard[] }[] };

const STAGES: SafetyStage[] = ['far', 'wait', 'near', 'close', 'here', 'trip', 'after'];
const TONES: SafetyTone[] = ['orange', 'ink', 'cream', 'green', 'sky', 'pink'];

function parseCard(value: unknown): SafetyCard | null {
  if (!value || typeof value !== 'object') return null;
  const c = value as Record<string, unknown>;
  const text = (k: string) => (typeof c[k] === 'string' && (c[k] as string).trim() ? (c[k] as string) : null);
  const key = text('key'), title = text('title'), line = text('line');
  if (!key || !title || !line) return null;
  return { key, title, line, emoji: text('emoji') ?? '', kick: text('kick') ?? '', tone: TONES.includes(c.tone as SafetyTone) ? (c.tone as SafetyTone) : 'cream' };
}

/** `safetyCards` from GET /rides/active; null from a server before the cards (the old sheets show then). */
export function parseSafetyCards(value: unknown): SafetyCards | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const raw = v.byStage && typeof v.byStage === 'object' ? (v.byStage as Record<string, unknown>) : {};
  const byStage: Partial<Record<SafetyStage, SafetyCard>> = {};
  for (const stage of STAGES) {
    const card = parseCard(raw[stage]);
    if (card) byStage[stage] = card;
  }
  const groups = (Array.isArray(v.groups) ? v.groups : [])
    .map((g) => {
      const group = g as Record<string, unknown>;
      const cards = (Array.isArray(group?.cards) ? group.cards : []).map(parseCard).filter((c): c is SafetyCard => c !== null);
      return typeof group?.title === 'string' && cards.length ? { title: group.title, cards } : null;
    })
    .filter((g): g is { title: string; cards: SafetyCard[] } => g !== null);
  return Object.keys(byStage).length ? { byStage, groups } : null;
}

/**
 * Where the ride is, as the server's safetyStageFor: the driver coming (minutes away: over 8 far, over 4 waiting,
 * over 1.5 near, else close; unknown: near), at the pickup, on the trip, or done.
 */
export function safetyStageFor(input: { status: string; arrived?: boolean; etaMinutes?: number | null }): SafetyStage {
  if (input.status === 'completed') return 'after';
  if (input.status === 'active') return 'trip';
  if (input.arrived) return 'here';
  const eta = input.etaMinutes;
  if (eta === null || eta === undefined || !Number.isFinite(eta) || eta <= 0) return 'near';
  const seconds = eta * 60;
  return seconds > 480 ? 'far' : seconds > 240 ? 'wait' : seconds > 90 ? 'near' : 'close';
}

export { tipList as parseTips };

export type SafetyMoment = 'before' | 'start' | 'after';

/**
 * Which safety sheet is due on the trip screen now, if any (each once per trip):
 *   before  the driver is coming and the tips are known
 *   start   the trip runs and the driver's phone records it
 */
export function dueSafetyMoment(
  ride: { rideId: string; status: string; recorded?: boolean; safety?: TripSafety; safetyCards?: SafetyCards | null } | null | undefined,
  seen: (key: string) => boolean,
): SafetyMoment | null {
  if (!ride) return null;
  if (ride.status === 'active' && ride.recorded && !seen(`start:${ride.rideId}`)) return 'start';
  // With the cards the tip sits on the trip screen itself: no "Before you get in" sheet.
  if (ride.safetyCards) return null;
  if (ride.status === 'matched' && (ride.safety?.before.length ?? 0) > 0 && !seen(`before:${ride.rideId}`)) return 'before';
  return null;
}
