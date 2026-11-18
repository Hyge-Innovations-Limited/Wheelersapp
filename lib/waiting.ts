/**
 * Waiting time (Timi, 12 Nov 2026): once the driver taps Arrived the rider has
 * some free minutes (5), then pays a fee for every full minute (₦70) until the
 * trip starts. The server keeps the rule and the money (Wheelers-Backend
 * apps/api-gateway/src/rides/waiting.ts); the app only shows the meter, on the
 * server's clock: `skewMs` is how far the phone's clock is from it.
 */

/**
 * The waiting price (Timi, 16 Nov 2026): after the free minutes the rider keeps
 * the driver waiting at a price a minute (₦40–100) the driver accepts or
 * counters, or cancels. Nothing is charged until they agree. The server keeps
 * it (rides/waiting-deal.ts); `freeSeconds`/`ngnPerMinute` above are already
 * this ride's own (free until the agreement, ₦0 a minute before it).
 */
export type WaitingDeal = {
  rates: number[];
  baseFreeSeconds: number;
  rateNgn: number | null;
  agreedAtMs: number | null;
  /** The offer waiting for an answer. `atMs` tells one offer from the next. */
  offer: { by: 'rider' | 'driver'; ngn: number; atMs: number } | null;
  offersLeft: number;
};

export const WAITING_RATES = [40, 50, 60, 70, 80, 90, 100];

export type WaitingInfo = {
  freeSeconds: number;
  ngnPerMinute: number;
  /** Absent: an older server, with a fixed price a minute. */
  deal?: WaitingDeal;
  arrivedAtMs: number;
  /** The meter stopped here (the driver was told it could not be collected). Null: it runs. */
  stoppedAtMs: number | null;
  /** Server clock minus phone clock, when the server's "now" was read. */
  skewMs: number;
};

/** What the rider owes for waiting once the trip started (written by the server at the start). */
export type WaitingResult = { minutes: number; feeNgn: number; paid: boolean };

/** Used only until the server's own terms arrive (just after Arrived): 5 free minutes, then a price to agree. */
export const DEFAULT_WAITING: Pick<WaitingInfo, 'freeSeconds' | 'ngnPerMinute' | 'deal'> = {
  freeSeconds: 5 * 60,
  ngnPerMinute: 0,
  deal: { rates: WAITING_RATES, baseFreeSeconds: 5 * 60, rateNgn: null, agreedAtMs: null, offer: null, offersLeft: 10 },
};

function parseDeal(value: unknown): WaitingDeal | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const d = value as Record<string, unknown>;
  const rates = Array.isArray(d.rates) ? d.rates.filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0) : [];
  const o = d.offer && typeof d.offer === 'object' ? (d.offer as Record<string, unknown>) : null;
  const offerNgn = o ? num(o.ngn) : null;
  const offer = o && (o.by === 'rider' || o.by === 'driver') && offerNgn !== null && offerNgn > 0
    ? { by: o.by as 'rider' | 'driver', ngn: offerNgn, atMs: time(o.at) ?? 0 }
    : null;
  const rateNgn = num(d.rateNgn);
  return {
    rates: rates.length ? rates : WAITING_RATES,
    baseFreeSeconds: Math.max(0, num(d.baseFreeSeconds) ?? DEFAULT_WAITING.freeSeconds),
    rateNgn: rateNgn !== null && rateNgn > 0 ? rateNgn : null,
    agreedAtMs: time(d.agreedAt),
    offer,
    offersLeft: Math.max(0, num(d.offersLeft) ?? 0),
  };
}

const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const time = (value: unknown): number | null => {
  if (typeof value !== 'string') return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
};

/** The server's `waiting` block (GET ride, the driver's ride snapshot, the ride page). Undefined when it has none. */
export function parseWaiting(value: unknown, receivedAt: number = Date.now()): WaitingInfo | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const w = value as Record<string, unknown>;
  const arrivedAtMs = time(w.arrivedAt);
  if (arrivedAtMs === null) return undefined;
  const serverNow = time(w.now);
  const deal = parseDeal(w.deal);
  return {
    freeSeconds: Math.max(0, num(w.freeSeconds) ?? DEFAULT_WAITING.freeSeconds),
    // An older server without `deal` charged a fixed price: ₦70 when it did not say.
    ngnPerMinute: Math.max(0, num(w.ngnPerMinute) ?? (deal ? 0 : 70)),
    ...(deal ? { deal } : {}),
    arrivedAtMs,
    stoppedAtMs: time(w.stoppedAt),
    skewMs: serverNow === null ? 0 : serverNow - receivedAt,
  };
}

/** The fee written at the start, from the same block (or a completion message). Null when none was due. */
export function parseWaitingResult(value: unknown): WaitingResult | null {
  if (!value || typeof value !== 'object') return null;
  const w = value as Record<string, unknown>;
  const feeNgn = num(w.feeNgn) ?? num(w.waitingFeeNgn);
  if (feeNgn === null || feeNgn <= 0) return null;
  return { minutes: num(w.minutes) ?? num(w.waitingMinutes) ?? 0, feeNgn, paid: (w.paid ?? w.waitingPaid) === true };
}

export type WaitingClock = {
  waitedSeconds: number;
  /** Still inside the free minutes. */
  free: boolean;
  freeLeftSeconds: number;
  /** Full minutes past the free ones, and what they cost. */
  chargedMinutes: number;
  feeNgn: number;
  stopped: boolean;
};

export function waitingClock(info: WaitingInfo, phoneNow: number = Date.now()): WaitingClock {
  const end = info.stoppedAtMs ?? phoneNow + info.skewMs;
  const waitedSeconds = Math.max(0, Math.floor((end - info.arrivedAtMs) / 1000));
  const freeLeftSeconds = Math.max(0, info.freeSeconds - waitedSeconds);
  const chargedMinutes = Math.max(0, Math.floor((waitedSeconds - info.freeSeconds) / 60));
  return {
    waitedSeconds,
    free: waitedSeconds < info.freeSeconds,
    freeLeftSeconds,
    chargedMinutes,
    feeNgn: chargedMinutes * info.ngnPerMinute,
    stopped: info.stoppedAtMs !== null,
  };
}

export type WaitingStage =
  /** Inside the free minutes. */
  | 'free'
  /** The free minutes are over and no price is agreed: the rider (or the driver) has something to answer. */
  | 'deal'
  /** A price runs (agreed, or an older server's fixed one), or the meter stopped. */
  | 'meter';

export function waitingStage(info: WaitingInfo, phoneNow: number = Date.now()): WaitingStage {
  const end = info.stoppedAtMs ?? phoneNow + info.skewMs;
  const waited = Math.max(0, Math.floor((end - info.arrivedAtMs) / 1000));
  const baseFree = info.deal ? info.deal.baseFreeSeconds : info.freeSeconds;
  if (waited < baseFree) return 'free';
  if (info.deal && info.deal.rateNgn === null && info.stoppedAtMs === null) return 'deal';
  return 'meter';
}

/** The waiting block that came with a `ride:waiting` socket message ({ rideId, waiting }). */
export function waitingFromMessage(payload: Record<string, unknown>, receivedAt: number = Date.now()): WaitingInfo | undefined {
  return parseWaiting(payload.waiting, receivedAt);
}

/**
 * When the rider's waiting sheet opens by itself, once each: the free minutes just ended with nothing on the
 * table, or the driver asked a price. The key says which (null: nothing to ask now).
 */
export function waitingAskKey(rideId: string, info: WaitingInfo, phoneNow: number = Date.now()): string | null {
  if (waitingStage(info, phoneNow) !== 'deal' || !info.deal) return null;
  const offer = info.deal.offer;
  if (!offer) return `wait-ask:${rideId}:${info.arrivedAtMs}`;
  return offer.by === 'driver' ? `wait-counter:${rideId}:${offer.atMs}` : null;
}

/** 4:12, 12:05. */
export function minutesSeconds(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const naira = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`;

/** The rider's line once the trip started; null when no fee was due. Same words as the server and the ride page. */
export function waitingLineForRider(result: WaitingResult | null | undefined, cash = false): string | null {
  if (!result || !(result.feeNgn > 0)) return null;
  // A cash ride (18 Nov 2026): as the server says it.
  if (cash && !result.paid) return `Waiting time: ${result.minutes} min · ${naira(result.feeNgn)}. Pay it to your driver in cash with the fare.`;
  return result.paid
    ? `Waiting time: ${result.minutes} min · ${naira(result.feeNgn)}, paid from your wallet.`
    : `Waiting time: ${result.minutes} min · ${naira(result.feeNgn)}. Your wallet couldn't cover it, so pay your driver.`;
}
