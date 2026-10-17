/**
 * Face ID / fingerprint, for unlocking the app instead of typing the PIN.
 *
 * Loaded with care: the native part only exists in builds made after it was
 * added, and an update sent over the air reaches older builds too. There the
 * module is missing, so everything here answers "not available" and the app
 * goes on with the PIN, never crashing for want of it.
 */
import { requireOptionalNativeModule } from "expo";

type LocalAuthentication = typeof import("expo-local-authentication");

let native: LocalAuthentication | null | undefined;

function module(): LocalAuthentication | null {
  if (native === undefined) {
    // Asked first, never loaded blind: loading it on a build without it is
    // not an error this code could catch. The bundler reports it as a crash
    // (the 1.0.4 update that closed the app on every phone, 17 Oct).
    if (!requireOptionalNativeModule("ExpoLocalAuthentication")) {
      native = null;
      return native;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      native = require("expo-local-authentication") as LocalAuthentication;
    } catch {
      native = null;
    }
  }
  return native;
}

export type BiometricKind = "face" | "fingerprint" | "biometrics";

/** This phone can check its owner (Face ID or a fingerprint is set up), and which kind. Null when it cannot. */
export async function biometricKind(): Promise<BiometricKind | null> {
  const la = module();
  if (!la) return null;
  try {
    if (!(await la.hasHardwareAsync()) || !(await la.isEnrolledAsync())) return null;
    const kinds = await la.supportedAuthenticationTypesAsync();
    if (kinds.includes(la.AuthenticationType.FACIAL_RECOGNITION)) return "face";
    if (kinds.includes(la.AuthenticationType.FINGERPRINT)) return "fingerprint";
    return "biometrics";
  } catch {
    return null;
  }
}

/** "Face ID", "fingerprint": what to call it on a button. */
export function biometricName(kind: BiometricKind | null): string {
  return kind === "face" ? "Face ID" : kind === "fingerprint" ? "fingerprint" : "Face ID or fingerprint";
}

/** Asks the owner to look or touch. True only when the phone says it is them. */
export async function confirmOwner(reason: string): Promise<boolean> {
  const la = module();
  if (!la) return false;
  try {
    const result = await la.authenticateAsync({ promptMessage: reason, cancelLabel: "Use PIN", disableDeviceFallback: true });
    return result.success;
  } catch {
    return false;
  }
}
