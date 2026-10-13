import AsyncStorage from "@react-native-async-storage/async-storage";

import { TERMS_VERSION } from "@/constants/legal-text";

/**
 * Who has read and accepted the terms on this phone: the rider side, the
 * driver side, or both. Kept per version of the terms, so when the terms
 * change everyone is asked again.
 */
// "2": ticks from before an acceptance was tied to a sign-in are not read. They
// outlived logouts, so they could not say who had made them.
const ACCEPTED_KEY = "wheelers.terms.accepted.2";

type Accepted = { version: string; who: string[] };

/** What is stored, made safe: an older version or anything damaged counts as nobody. */
export function acceptedFrom(stored: unknown, version = TERMS_VERSION): string[] {
  if (!stored || typeof stored !== "object") return [];
  const { version: storedVersion, who } = stored as Partial<Accepted>;
  if (storedVersion !== version || !Array.isArray(who)) return [];
  return who.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}

async function read(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(ACCEPTED_KEY);
    return raw ? acceptedFrom(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

export async function hasAcceptedTerms(who: string): Promise<boolean> {
  return (await read()).includes(who);
}

export async function acceptTerms(who: string): Promise<void> {
  const accepted = await read();
  if (accepted.includes(who)) return;
  const next: Accepted = { version: TERMS_VERSION, who: [...accepted, who].slice(-20) };
  await AsyncStorage.setItem(ACCEPTED_KEY, JSON.stringify(next)).catch(() => undefined);
}

/**
 * Forget who accepted on this phone. Done at logout: an acceptance belongs to
 * the person who gave it, and the next person to sign in on this phone has
 * not given one.
 */
export async function forgetAcceptedTerms(): Promise<void> {
  await AsyncStorage.removeItem(ACCEPTED_KEY).catch(() => undefined);
}

/** Who accepted: the rider side or the driver side of this phone. The two have their own sign-in, so each is asked once. */
export const RIDER_TERMS_KEY = "rider";
export const DRIVER_TERMS_KEY = "driver";

/**
 * What the person was doing when the terms were put in front of them
 * (continuing with Google, sending their sign-in code). Accepting carries on
 * with it, so they are never sent back to tap the same button twice. Closing
 * or declining forgets it. One at a time: only one terms screen is ever open.
 */
let carryOn: (() => void) | null = null;

export function afterAccepting(action: () => void): void {
  carryOn = action;
}

/** Hands back what to carry on with, once. */
export function takeAfterAccepting(): (() => void) | null {
  const action = carryOn;
  carryOn = null;
  return action;
}

export function forgetAfterAccepting(): void {
  carryOn = null;
}
