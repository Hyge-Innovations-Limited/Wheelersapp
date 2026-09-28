import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { getAccessTokenWithRetry } from '@/lib/access-token';
import { useAuth } from '@/lib/auth';
import {
  inflight, listeners, memory, notify, readStored, scopedKey, staleListeners, tokenSubject, writeStored,
  type CacheStorage, type Entry,
} from '@/lib/cache-store';

export { clearCachedQueries, invalidateCached, type CacheStorage } from '@/lib/cache-store';

/**
 * Data a screen shows at once, from the last time, and refreshes by itself.
 *
 * A screen asks for a key ("wallet.overview", "earnings.today"). If this phone
 * has a copy, the screen gets it immediately, even after the app was closed;
 * if the copy is older than `staleMs`, it is fetched again quietly and the
 * screen updates in place. The spinner is only for the very first time.
 *
 * Fetched again by itself when the app comes back to the foreground, when a
 * screen showing it is opened, and when the server says it changed
 * (invalidateCached, e.g. on wallet:updated). Pull to refresh still forces it.
 *
 * Copies are kept per signed-in user, in plain storage, or in the phone's
 * secure storage for anything with an account number in it. Signing out
 * wipes them all (clearCachedQueries).
 */

/* ── the hook ────────────────────────────────────────────────────────────── */

export type CachedQueryOptions<T> = {
  /** What this is, e.g. "wallet.overview" or "earnings.week". */
  key: string;
  fetcher: (accessToken: string) => Promise<T>;
  /** How old a copy may be before it is fetched again. */
  staleMs?: number;
  storage?: CacheStorage;
  /** False: show what is kept, fetch nothing (e.g. not signed in). */
  enabled?: boolean;
};

export type CachedQuery<T> = {
  data: T | null;
  /** True only while there is nothing to show yet. */
  loading: boolean;
  /** A fetch is running (with something already on screen). */
  refreshing: boolean;
  error: string | null;
  /** When the copy on screen was fetched. */
  updatedAt: number | null;
  /** Fetch now, whatever its age. */
  refresh: () => Promise<void>;
};

export function useCachedQuery<T>({ key, fetcher, staleMs = 60_000, storage = 'plain', enabled = true }: CachedQueryOptions<T>): CachedQuery<T> {
  const { getAccessToken, isReady, user } = useAuth();
  const [scope, setScope] = useState<string | null>(null);
  const fullKey = scope ? scopedKey(scope, key) : null;
  const [entry, setEntry] = useState<Entry | null>(() => null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  // Whose copies: known from the login token.
  useEffect(() => {
    if (!isReady || !user) { setScope(null); return; }
    let cancelled = false;
    void getAccessTokenWithRetry(getAccessToken).then((token) => {
      if (!cancelled) setScope(token ? tokenSubject(token) ?? 'me' : null);
    });
    return () => { cancelled = true; };
  }, [getAccessToken, isReady, user]);

  const fetchNow = useCallback(async (): Promise<void> => {
    if (!fullKey || !enabled) return;
    const running = inflight.get(fullKey);
    if (running) { await running.catch(() => undefined); return; }
    const job = (async () => {
      const token = await getAccessTokenWithRetry(getAccessToken);
      if (!token) throw new Error('Not signed in.');
      const data = await fetcherRef.current(token);
      const next = { data, at: Date.now() };
      memory.set(fullKey, next);
      void writeStored(storage, fullKey, next);
      notify(fullKey);
      return data;
    })();
    inflight.set(fullKey, job);
    setRefreshing(true);
    try {
      await job;
      setError(null);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Could not load this.');
    } finally {
      inflight.delete(fullKey);
      setRefreshing(false);
    }
  }, [enabled, fullKey, getAccessToken, storage]);

  const fetchIfStale = useCallback(() => {
    if (!fullKey) return;
    const current = memory.get(fullKey);
    if (!current || Date.now() - current.at > staleMs) void fetchNow();
  }, [fetchNow, fullKey, staleMs]);

  // The copy: memory first, then the phone's storage, then the network if old.
  useEffect(() => {
    if (!fullKey) return;
    let cancelled = false;
    const inMemory = memory.get(fullKey);
    if (inMemory) {
      setEntry(inMemory);
      fetchIfStale();
    } else {
      setEntry(null);
      void readStored(storage, fullKey).then((stored) => {
        if (cancelled) return;
        if (stored && !memory.get(fullKey)) {
          memory.set(fullKey, stored);
          setEntry(stored);
        }
        fetchIfStale();
      });
    }
    const listener = () => setEntry(memory.get(fullKey) ?? null);
    const set = listeners.get(fullKey) ?? new Set();
    set.add(listener);
    listeners.set(fullKey, set);
    return () => {
      cancelled = true;
      set.delete(listener);
    };
  }, [fetchIfStale, fullKey, storage]);

  // Told it changed: fetch again if it is ours.
  useEffect(() => {
    const onStale = (prefix: string) => {
      if (key === prefix || key.startsWith(`${prefix}.`)) void fetchNow();
    };
    staleListeners.add(onStale);
    return () => { staleListeners.delete(onStale); };
  }, [fetchNow, key]);

  // Back in the foreground.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') fetchIfStale();
    });
    return () => subscription.remove();
  }, [fetchIfStale]);

  // This screen opened again.
  useFocusEffect(useCallback(() => { fetchIfStale(); }, [fetchIfStale]));

  return {
    data: (entry?.data as T | undefined) ?? null,
    loading: !entry && enabled && error === null,
    refreshing,
    error,
    updatedAt: entry?.at ?? null,
    refresh: fetchNow,
  };
}
