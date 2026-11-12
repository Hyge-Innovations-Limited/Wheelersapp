/**
 * Waiting time (Timi, 12 Nov 2026): once the driver taps Arrived the rider has
 * some free minutes (5), then pays a fee for every full minute (₦70) until the
 * trip starts. The server keeps the rule and the money (Wheelers-Backend
 * apps/api-gateway/src/rides/waiting.ts); the app only shows the meter, on the
 * server's clock: `skewMs` is how far the phone's clock is from it.
 */

export type WaitingInfo = {
  freeSeconds: number;
  ngnPerMinute: number;
  arrivedAtMs: number;
  /** The meter stopped here (the driver was told it could not be collected). Null: it runs. */
  stoppedAtMs: number | null;
  /** Server clock minus phone clock, when the server's "now" was read. */
  skewMs: number;
};

/** What the rider owes for waiting once the trip started (written by the server at the start). */
export type WaitingResult = { minutes: number; feeNgn: number; paid: boolean };

/** Used only until the server's own terms arrive (an older server, or just after Arrived). */
export const DEFAULT_WAITING = { freeSeconds: 5 * 60, ngnPerMinute: 70 };

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
  return {
    freeSeconds: Math.max(0, num(w.freeSeconds) ?? DEFAULT_WAITING.freeSeconds),
    ngnPerMinute: Math.max(0, num(w.ngnPerMinute) ?? DEFAULT_WAITING.ngnPerMinute),
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

/** 4:12, 12:05. */
export function minutesSeconds(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const naira = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`;

/** The rider's line once the trip started; null when no fee was due. Same words as the server and the ride page. */
export function waitingLineForRider(result: WaitingResult | null | undefined): string | null {
  if (!result || !(result.feeNgn > 0)) return null;
  return result.paid
    ? `Waiting time: ${result.minutes} min · ${naira(result.feeNgn)}, paid from your wallet.`
    : `Waiting time: ${result.minutes} min · ${naira(result.feeNgn)}. Your wallet couldn't cover it, so pay your driver.`;
}
