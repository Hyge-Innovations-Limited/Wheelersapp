import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Where someone was, so the app can open there again.
 *
 * Android closes an app left in the background a while to free memory; the
 * next time it is opened it starts from the splash, which used to land
 * everyone on home, wherever they had been: halfway through booking, in the
 * wallet, in a chat. Now the screen they were on (with what it was showing,
 * which lives in its route params) is remembered as they move, and the
 * splash opens it again over home when they come back within half an hour.
 *
 * Only screens that can stand on their own are reopened. A trip under way
 * (searching, driver found, on the trip, cancelling, rating) is brought back
 * by the ride session from the server instead, and sign-in screens never are.
 */

export type ResumeSide = "rider" | "driver";
export type Place = { pathname: string; params: Record<string, string> };

const KEY = "wheelers.resume.place";
/** Back after longer than this, they start from home: what they were doing has gone stale. */
export const RESUME_WITHIN_MS = 30 * 60_000;

const BOTH = ["/support/chat", "/support/help-center", "/profile/settings", "/profile/edit-profile", "/profile/security-pin"];
const SCREENS: Record<ResumeSide, ReadonlySet<string>> = {
  rider: new Set([
    ...BOTH,
    "/destination-search", "/ride-selection", "/schedule-ride", "/saved-places",
    "/rider-referral", "/rider-add-money", "/rider-withdraw",
    "/rider/wallet", "/rider/history", "/rider/transactions", "/rider/profile", "/rider/notifications", "/rider/interstate",
    "/interstate-booking", "/trip-receipt", "/scheduled-ride", "/group-ride",
  ]),
  driver: new Set([
    ...BOTH,
    "/growth/referral", "/growth/promos",
    "/driver/earnings", "/driver/payout", "/driver/withdraw", "/driver/docs", "/driver/profile", "/driver/legal-details",
    "/driver/stellar", "/driver/stellar-send", "/driver/stellar-transfer",
  ]),
};

/** Screens the app is only ever passing through at start: neither remembered nor a reason to forget. */
const STARTING = new Set(["/", "/splash"]);

export function isResumable(pathname: string, side: ResumeSide): boolean {
  return SCREENS[side].has(pathname);
}

/**
 * Called as they move: a screen that can be reopened is remembered; any
 * other (home, a trip, signing in or out) forgets, so they come back there
 * the ordinary way.
 */
export async function rememberPlace(pathname: string, params: Record<string, unknown>, side: ResumeSide, now = Date.now()): Promise<void> {
  if (STARTING.has(pathname)) return;
  try {
    if (!isResumable(pathname, side)) {
      await AsyncStorage.removeItem(KEY);
      return;
    }
    // Route params are strings; anything else (an array from a repeated key) is left out.
    const kept = Object.fromEntries(Object.entries(params).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
    await AsyncStorage.setItem(KEY, JSON.stringify({ pathname, params: kept, side, at: now }));
  } catch {
    // Remembering is a nicety: never in the way of using the app.
  }
}

/** The place to reopen, once (it is forgotten as it is taken), or null. */
export async function takePlace(side: ResumeSide, now = Date.now()): Promise<Place | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    await AsyncStorage.removeItem(KEY);
    const saved = JSON.parse(raw) as { pathname?: unknown; params?: unknown; side?: unknown; at?: unknown };
    if (saved.side !== side || typeof saved.pathname !== "string" || typeof saved.at !== "number") return null;
    if (now - saved.at > RESUME_WITHIN_MS || now < saved.at) return null;
    if (!isResumable(saved.pathname, side)) return null;
    const params = saved.params && typeof saved.params === "object" ? (saved.params as Record<string, string>) : {};
    return { pathname: saved.pathname, params };
  } catch {
    return null;
  }
}
