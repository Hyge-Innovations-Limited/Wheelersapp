/**
 * Passkeys on this phone: make one for the account, and sign in with it
 * instead of an SMS code (Face ID or a fingerprint unlocks it).
 *
 * Loaded with care, like Face ID (lib/biometrics.ts): the native part only
 * exists in builds made after it was added, and an over-the-air update reaches
 * older builds too. There everything here says "not available" and sign-in
 * stays SMS only, never crashing for want of it.
 */
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

type Passkeys = typeof import("react-native-passkeys");

let native: Passkeys | null | undefined;

function module(): Passkeys | null {
  if (native === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      native = require("react-native-passkeys") as Passkeys;
    } catch {
      native = null;
    }
  }
  return native;
}

/** Set once this phone has offered the signed-in account a passkey (lib/passkey-account.ts). */
export const PASSKEY_OFFERED_KEY = "wheelers.passkey.offered";

/** On sign-out, so the next account on this phone is offered one too. */
export async function forgetPasskeyOffer(): Promise<void> {
  await SecureStore.deleteItemAsync(PASSKEY_OFFERED_KEY).catch(() => undefined);
}

/** This phone and build can make and use passkeys. */
export function passkeysAvailable(): boolean {
  const passkeys = module();
  if (!passkeys) return false;
  try {
    return passkeys.isSupported();
  } catch {
    return false;
  }
}

/** What the passkey is called in the list on the Security screen. */
export function thisDeviceName(): string {
  return Platform.OS === "ios" ? "iPhone" : "Android phone";
}

/** Thrown when the person closed the phone's own prompt: not an error to show. */
export class PasskeyCancelled extends Error {
  constructor() {
    super("Passkey cancelled.");
    this.name = "PasskeyCancelled";
  }
}

/** Ask the phone to make a passkey from the server's options. The answer goes back to the server to keep. */
export async function makePasskey(options: Record<string, unknown>): Promise<Record<string, unknown>> {
  const passkeys = module();
  if (!passkeys) throw new Error("Passkeys need the latest version of the app.");
  const made = await passkeys.create(options as never).catch((error: unknown) => {
    if (isCancel(error)) throw new PasskeyCancelled();
    throw error;
  });
  if (!made) throw new PasskeyCancelled();
  return made as unknown as Record<string, unknown>;
}

/** Ask the phone to sign the server's challenge with the passkey it holds. */
export async function signWithPasskey(options: Record<string, unknown>): Promise<Record<string, unknown>> {
  const passkeys = module();
  if (!passkeys) throw new Error("Passkeys need the latest version of the app.");
  const signed = await passkeys.get(options as never).catch((error: unknown) => {
    if (isCancel(error)) throw new PasskeyCancelled();
    throw error;
  });
  if (!signed) throw new PasskeyCancelled();
  return signed as unknown as Record<string, unknown>;
}

function isCancel(error: unknown): boolean {
  const text = `${(error as { name?: string })?.name ?? ""} ${(error as { message?: string })?.message ?? ""}`.toLowerCase();
  return /cancel|notallowed|not allowed|abort|user (dismissed|closed)/.test(text);
}
