/**
 * How long to wait before the next reconnect attempt.
 *
 * Both sessions used to retry every 1.5 seconds, forever, all at once. After a
 * deploy or a crash that meant every phone hit the server in the same second,
 * and kept hitting it while it was trying to come back: the reconnect storm.
 *
 * Now the wait doubles with each failed attempt (1s, 2s, 4s ... capped at 30s)
 * and every wait is scattered: the real delay is a random point between half of
 * the step and the whole step, so ten thousand phones that dropped together
 * come back spread over the window instead of on the same tick.
 *
 * The count of failures resets once a connection has STAYED open for a while.
 * A socket the server accepts and drops a second later is not a success, and
 * must not put the phone back on the fast first step.
 */

export const RECONNECT_BASE_MS = 1_000;
export const RECONNECT_MAX_MS = 30_000;
/** A connection open this long counts as healthy, and the failure count resets. */
export const RECONNECT_STABLE_MS = 10_000;

/** The step for this attempt (0 = first retry), before it is scattered. */
export function reconnectStepMs(attempt: number): number {
  const n = Number.isFinite(attempt) ? Math.max(0, Math.floor(attempt)) : 0;
  // 2 ** 15 seconds is already hours; past that the cap is the answer.
  return Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** Math.min(n, 15));
}

/** The wait before this attempt: between half of the step and the whole step. */
export function reconnectDelayMs(attempt: number, random: () => number = Math.random): number {
  const step = reconnectStepMs(attempt);
  const r = Math.min(1, Math.max(0, random()));
  return Math.round(step / 2 + (step / 2) * r);
}

/**
 * The failure count for one connection: bump it when an attempt fails or the
 * socket drops, and tell it when a socket opens and when it closes so it can
 * reset only after a connection that lasted.
 */
export function createReconnectBackoff(random: () => number = Math.random, now: () => number = Date.now) {
  let attempt = 0;
  let openedAt: number | null = null;
  return {
    /** A socket opened. */
    opened(): void {
      openedAt = now();
    },
    /** The wait before the next attempt. Call when a socket closed or a connect failed. */
    nextDelayMs(): number {
      if (openedAt !== null && now() - openedAt >= RECONNECT_STABLE_MS) attempt = 0;
      openedAt = null;
      const delay = reconnectDelayMs(attempt, random);
      attempt += 1;
      return delay;
    },
    /** The user went offline or signed out on purpose: the next connect starts fresh. */
    reset(): void {
      attempt = 0;
      openedAt = null;
    },
    get attempt(): number {
      return attempt;
    },
  };
}
