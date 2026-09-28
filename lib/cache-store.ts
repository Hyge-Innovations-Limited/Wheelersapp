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
    const parsed = JSON.parse(raw) as Entry;
    return parsed && typeof parsed.at === 'number' ? parsed : null;
  } catch {
    return null;
  }
}

export async function writeStored(storage: CacheStorage, fullKey: string, entry: Entry): Promise<void> {
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

/** Sign-out: nothing of this person stays on the phone. */
export async function clearCachedQueries(): Promise<void> {
  memory.clear();
  inflight.clear();
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

