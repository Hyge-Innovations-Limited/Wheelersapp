/**
 * Rolling logins. A login lasts a year; when the app opens or comes back to
 * the front and its login is over a day old, it is swapped for a fresh one.
 * Anyone who opens the app at least once a year stays signed in. A login
 * that has really ended (expired, signed out elsewhere, account deleted) is
 * reported as "ended", so the app can take the person to sign in instead of
 * failing every screen with "please sign in again".
 *
 * No phone APIs here: the caller hands in how to read, renew and store the
 * login, so the decision can be tested on its own.
 */

export const RENEW_AFTER_MS = 24 * 60 * 60 * 1000;

export type RenewalOutcome =
  | "none"     // not signed in
  | "fresh"    // signed in recently: nothing to do
  | "renewed"  // swapped for a fresh one-year login
  | "ended"    // the login is over: sign in again
  | "offline"; // could not reach the server: try again next time

export interface RenewalDeps {
  getToken: () => Promise<string | null>;
  /** Asks the server for a fresh login. Rejects with { status } on an HTTP error. */
  refresh: (token: string) => Promise<{ accessToken: string }>;
  store: (token: string) => Promise<void>;
  now?: () => number;
}

function decodeSegment(segment: string): unknown {
  const base64 = segment.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(segment.length / 4) * 4, "=");
  return JSON.parse(atob(base64));
}

/** When the login was issued and when it ends (ms), or null when it cannot be read. */
export function loginTimes(token: string): { issuedAt: number; endsAt: number } | null {
  try {
    const payload = decodeSegment(token.split(".")[1] ?? "") as { iat?: unknown; exp?: unknown };
    if (typeof payload.iat !== "number" || typeof payload.exp !== "number") return null;
    return { issuedAt: payload.iat * 1000, endsAt: payload.exp * 1000 };
  } catch {
    return null;
  }
}

let inFlight: Promise<RenewalOutcome> | null = null;

export function renewSessionIfDue(deps: RenewalDeps): Promise<RenewalOutcome> {
  // The app coming to the front twice in a second renews once.
  if (!inFlight) {
    inFlight = run(deps).finally(() => { inFlight = null; });
  }
  return inFlight;
}

async function run(deps: RenewalDeps): Promise<RenewalOutcome> {
  const now = (deps.now ?? Date.now)();
  const token = await deps.getToken();
  if (!token) return "none";
  const times = loginTimes(token);
  if (!times || times.endsAt <= now) return "ended";
  if (now - times.issuedAt < RENEW_AFTER_MS) return "fresh";
  try {
    const { accessToken } = await deps.refresh(token);
    if (!accessToken || !loginTimes(accessToken)) return "offline";
    await deps.store(accessToken);
    return "renewed";
  } catch (error) {
    const status = (error as { status?: unknown })?.status;
    // Only the server saying no ends a login; a bad connection never does.
    return status === 401 ? "ended" : "offline";
  }
}
