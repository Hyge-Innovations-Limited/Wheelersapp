import AsyncStorage from "@react-native-async-storage/async-storage";

import { TERMS_VERSION } from "@/constants/legal-text";

/**
 * Who has read and accepted the terms on this phone: the rider side, the
 * driver side, or both. Kept per version of the terms, so when the terms
 * change everyone is asked again.
 */
const ACCEPTED_KEY = "wheelers.terms.accepted";

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

/** Who accepted: the rider side or the driver side of this phone. The two have their own sign-in, so each is asked once. */
export const RIDER_TERMS_KEY = "rider";
export const DRIVER_TERMS_KEY = "driver";
