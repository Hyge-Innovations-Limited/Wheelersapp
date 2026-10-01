/**
 * "This driver chose Go Online and has not chosen Go Offline since" — kept on
 * the phone, not just in memory.
 *
 * Swiping the app away used to forget it: the app came back Offline, the
 * driver had to go online again, and every request in flight was sent to them
 * again from the top. The choice now survives a closed app, and the session
 * puts them back online on launch. Going offline, signing out and the KYC
 * lock all clear it (through stopDriverLivenessUpdates).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'wheelers.driver.onlineIntent';
/** A choice older than a long shift is not a choice any more: nobody is put online by yesterday. */
export const ONLINE_INTENT_MAX_AGE_MS = 12 * 60 * 60_000;

export type OnlineIntent = { lat: number; lng: number; at: number };

export async function rememberOnline(lat: number, lng: number, now: number = Date.now()): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify({ lat, lng, at: now } satisfies OnlineIntent)).catch(() => undefined);
}

export async function forgetOnline(): Promise<void> {
  await AsyncStorage.removeItem(KEY).catch(() => undefined);
}

/** The choice, when there is a fresh one. */
export async function readOnlineIntent(now: number = Date.now()): Promise<OnlineIntent | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return parseOnlineIntent(raw, now);
  } catch {
    return null;
  }
}

export function parseOnlineIntent(raw: string | null, now: number): OnlineIntent | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<OnlineIntent>;
    if (typeof value.lat !== 'number' || typeof value.lng !== 'number' || typeof value.at !== 'number') return null;
    if (!Number.isFinite(value.lat) || !Number.isFinite(value.lng)) return null;
    if (now - value.at > ONLINE_INTENT_MAX_AGE_MS || value.at > now + 60_000) return null;
    return { lat: value.lat, lng: value.lng, at: value.at };
  } catch {
    return null;
  }
}
