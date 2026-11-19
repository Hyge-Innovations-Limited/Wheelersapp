import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

/**
 * Where cached screen data is kept (see cached-query.ts): in memory, and on
 * the phone, per signed-in user. Separate from the hook so sign-out can wipe
 * it without importing the hook (and the hook's import of auth).
 */

export type CacheStorage = 'memory' | 'plain' | 'secure';

export type Entry = { data: unknown; at: number };

export const memory = new Map<string, Entry>();
export const inflight = new Map<string, Promise<unknown>>();
export const listeners = new Map<string, Set<() => void>>();
const PLAIN_PREFIX = 'wheelers.cache.';
const SECURE_INDEX_KEY = 'wheelers.cache.secure-index';

/* ── whose cache: the user id inside the login token ─────────────────────── */

export function tokenSubject(token: string): string | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = typeof atob === 'function' ? atob(base64) : '';
    const sub = (JSON.parse(json) as { sub?: unknown }).sub;
    return typeof sub === 'string' && sub ? sub : null;
  } catch {
    return null;
  }
}

/** The key as stored: the user first, so one person never sees another's copy. */
export function scopedKey(scope: string, key: string): string {
  return `${scope}.${key}`.replace(/[^A-Za-z0-9._-]/g, '_');
}

/* ── storage ─────────────────────────────────────────────────────────────── */

export async function readStored(storage: CacheStorage, fullKey: string): Promise<Entry | null> {
  if (storage === 'memory') return null;
  try {
    const raw = storage === 'secure'
      ? await SecureStore.getItemAsync(`wc.${fullKey}`)
      : await AsyncStorage.getItem(PLAIN_PREFIX + fullKey);
    if (!raw) return null;
    storageOf.set(fullKey, storage);
    const parsed = JSON.parse(raw) as Entry;
    return parsed && typeof parsed.at === 'number' ? parsed : null;
  } catch {
    return null;
  }
}

/** Where each copy in memory is kept on the phone, so a live update can be kept the same way. */
const storageOf = new Map<string, CacheStorage>();

export async function writeStored(storage: CacheStorage, fullKey: string, entry: Entry): Promise<void> {
  storageOf.set(fullKey, storage);
  if (storage === 'memory') return;
  try {
    const raw = JSON.stringify(entry);
    if (storage === 'secure') {
      await SecureStore.setItemAsync(`wc.${fullKey}`, raw);
      // Secure storage cannot be listed; remember the key so sign-out can wipe it.
      const index = JSON.parse((await AsyncStorage.getItem(SECURE_INDEX_KEY)) ?? '[]') as string[];
      if (!index.includes(fullKey)) await AsyncStorage.setItem(SECURE_INDEX_KEY, JSON.stringify([...index, fullKey]));
    } else {
      await AsyncStorage.setItem(PLAIN_PREFIX + fullKey, raw);
    }
  } catch {
    /* a copy we could not keep is fetched again next time */
  }
}

export function notify(fullKey: string): void {
  listeners.get(fullKey)?.forEach((listener) => listener());
}

/**
 * The server says this changed: every copy whose key starts with `prefix`
 * (for everyone signed in on this phone) is stale, and screens showing it
 * fetch it again now.
 */
export function invalidateCached(prefix: string): void {
  // A copy on the phone not opened yet this run is fetched when it is.
  staleUntilOpened.add(prefix);
  for (const [fullKey, entry] of memory) {
    const key = fullKey.slice(fullKey.indexOf('.') + 1);
    if (key === prefix || key.startsWith(`${prefix}.`)) {
      memory.set(fullKey, { ...entry, at: 0 });
      notify(fullKey);
    }
  }
  staleListeners.forEach((listener) => listener(prefix));
}
export const staleListeners = new Set<(prefix: string) => void>();

/**
 * Stale while no screen shows it (nothing in memory yet this run): the next screen to open it fetches it once,
 * whatever the age of the copy on the phone.
 */
export const staleUntilOpened = new Set<string>();
export function takeStaleUntilOpened(key: string): boolean {
  for (const prefix of staleUntilOpened) {
    if (key === prefix || key.startsWith(`${prefix}.`)) {
      staleUntilOpened.delete(prefix);
      return true;
    }
  }
  return false;
}

/**
 * The server sent the new value itself (the live wallet): every copy of `key` is changed in place, on screen and on
 * the phone, with no fetch. `change` gets the copy and returns the new one (null: leave it). No copy in memory yet:
 * the copy on the phone is fetched again when it is next opened.
 */
export function patchCached(key: string, change: (data: unknown) => unknown | null): void {
  let found = false;
  for (const [fullKey, entry] of memory) {
    if (fullKey.slice(fullKey.indexOf('.') + 1) !== key) continue;
    found = true;
    const data = change(entry.data);
    if (data === null) continue;
    const next = { data, at: Date.now() };
    memory.set(fullKey, next);
    void writeStored(storageOf.get(fullKey) ?? 'memory', fullKey, next);
    notify(fullKey);
  }
  if (!found) staleUntilOpened.add(key);
}

/** Sign-out: nothing of this person stays on the phone. */
export async function clearCachedQueries(): Promise<void> {
  memory.clear();
  inflight.clear();
  staleUntilOpened.clear();
  storageOf.clear();
  try {
    const keys = await AsyncStorage.getAllKeys();
    await AsyncStorage.multiRemove(keys.filter((k) => k.startsWith(PLAIN_PREFIX) && k !== SECURE_INDEX_KEY));
    const index = JSON.parse((await AsyncStorage.getItem(SECURE_INDEX_KEY)) ?? '[]') as string[];
    await Promise.all(index.map((k) => SecureStore.deleteItemAsync(`wc.${k}`).catch(() => undefined)));
    await AsyncStorage.removeItem(SECURE_INDEX_KEY);
  } catch {
    /* best effort */
  }
}

