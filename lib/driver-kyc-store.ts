import * as SecureStore from "expo-secure-store";

/**
 * The driver's KYC status as the server last gave it: in memory for this
 * session, and in secure storage so an approved driver with no signal is not
 * locked out. Kept apart from the network code so sign-out can clear it.
 */

const KEY = "wheelers.driver.kyc";
let known: string | null = null;

export function knownDriverKyc(): string | null {
  return known;
}

export async function rememberDriverKyc(status: string): Promise<void> {
  known = status;
  await SecureStore.setItemAsync(KEY, status).catch(() => undefined);
}

export async function lastDriverKyc(): Promise<string | null> {
  return known ?? (await SecureStore.getItemAsync(KEY).catch(() => null));
}

export function forgetKnownDriverKyc(): void {
  known = null;
}

/** Signing out forgets it: the next person on this phone is checked afresh. */
export async function clearDriverKyc(): Promise<void> {
  known = null;
  await SecureStore.deleteItemAsync(KEY).catch(() => undefined);
}
