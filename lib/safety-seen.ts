import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Which safety sheets this phone already showed ("before:<ride>", "start:<ride>",
 * "after:<ride>"): each shows once per trip, also after the app restarts.
 * Kept in memory too, so a storage that fails still never shows one twice.
 */
const KEY = 'wheelers.safety.seen';
const WEEK_MS = 7 * 86_400_000;
const memory = new Map<string, number>();
let loaded = false;

export async function loadSafetySeen(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const stored = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    for (const [k, at] of Object.entries(stored)) if (typeof at === 'number') memory.set(k, at);
  } catch {
    /* memory only */
  }
}

export function safetySeen(key: string): boolean {
  return memory.has(key);
}

export function markSafetySeen(key: string): void {
  const now = Date.now();
  memory.set(key, now);
  for (const [k, at] of memory) if (now - at > WEEK_MS) memory.delete(k);
  void AsyncStorage.setItem(KEY, JSON.stringify(Object.fromEntries(memory))).catch(() => undefined);
}
