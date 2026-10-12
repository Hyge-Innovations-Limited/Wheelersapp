import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Where a rider was in signing in, kept on the phone so that leaving the app
 * (to read the code in Messages, or because the phone killed it) and coming
 * back lands on the same step and not at the start again.
 *
 *  - a code was sent and not yet typed: back to the code screen, for as long
 *    as that code is still good;
 *  - the code was right but the name was never given: back to the name screen.
 */

const PENDING_CODE_KEY = "wheelers.rider.sign-in.pending-code";
const NEEDS_NAME_KEY = "wheelers.rider.sign-in.needs-name";

/** A code is good for 30 minutes on the server; a little less here, so nobody is sent to type a dead one. */
export const PENDING_CODE_MS = 29 * 60 * 1000;

export type PendingCode = {
  phone: string;
  channel: "whatsapp" | "sms";
  /** When the code was sent, ms since 1970. */
  sentAt: number;
};

/** The code still waiting to be typed, or null: none was sent, or it is too old to use. */
export function freshPendingCode(stored: unknown, now: number): PendingCode | null {
  if (!stored || typeof stored !== "object") return null;
  const { phone, channel, sentAt } = stored as Partial<PendingCode>;
  if (typeof phone !== "string" || !/^\+\d{8,15}$/.test(phone)) return null;
  if (typeof sentAt !== "number" || !Number.isFinite(sentAt)) return null;
  if (sentAt > now || now - sentAt >= PENDING_CODE_MS) return null;
  return { phone, channel: channel === "whatsapp" ? "whatsapp" : "sms", sentAt };
}

export async function rememberPendingCode(code: PendingCode): Promise<void> {
  await AsyncStorage.setItem(PENDING_CODE_KEY, JSON.stringify(code)).catch(() => undefined);
}

export async function readPendingCode(now = Date.now()): Promise<PendingCode | null> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_CODE_KEY);
    const pending = raw ? freshPendingCode(JSON.parse(raw), now) : null;
    if (raw && !pending) await AsyncStorage.removeItem(PENDING_CODE_KEY);
    return pending;
  } catch {
    return null;
  }
}

export async function forgetPendingCode(): Promise<void> {
  await AsyncStorage.removeItem(PENDING_CODE_KEY).catch(() => undefined);
}

/** Signed in, but the new account still has no name. */
export async function markNameNeeded(): Promise<void> {
  await AsyncStorage.setItem(NEEDS_NAME_KEY, "1").catch(() => undefined);
}

export async function isNameNeeded(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(NEEDS_NAME_KEY)) === "1";
  } catch {
    return false;
  }
}

export async function clearNameNeeded(): Promise<void> {
  await AsyncStorage.removeItem(NEEDS_NAME_KEY).catch(() => undefined);
}
