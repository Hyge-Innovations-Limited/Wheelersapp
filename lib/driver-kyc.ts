import { getDriverKycStatus } from "@/lib/api";
import { forgetKnownDriverKyc, lastDriverKyc, rememberDriverKyc } from "@/lib/driver-kyc-store";

export { clearDriverKyc, knownDriverKyc } from "@/lib/driver-kyc-store";

/**
 * A driver's KYC status, as the SERVER last gave it, and where that sends
 * them. The dashboard is only for APPROVED drivers: every way in (sign-in,
 * reopening the app, a notification) asks here, and the dashboard itself
 * checks again when it opens and when the app comes back to the front.
 *
 * The last answer is kept (secure storage) only so an approved driver with
 * no signal is not locked out. Nothing on the phone can make a driver
 * approved: the server refuses to put an unapproved driver online anyway.
 */

export type DriverKycRoute =
  | "/driver/(tabs)/home"
  | "/driver/onboarding/pending"
  | "/driver/onboarding/welcome";

/** A launch never waits longer than this on the network: then the last answer is used. */
const CHECK_TIMEOUT_MS = 6_000;

export function routeForKyc(status: string | null): DriverKycRoute {
  if (status === "APPROVED") return "/driver/(tabs)/home";
  if (status === "SUBMITTED") return "/driver/onboarding/pending";
  return "/driver/onboarding/welcome";
}

/** Ask the server; when it cannot be reached, fall back to its last answer. */
export async function checkDriverKyc(accessToken: string): Promise<{ status: string | null; fromServer: boolean }> {
  try {
    const result = await Promise.race([
      getDriverKycStatus({ accessToken }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("KYC check timed out")), CHECK_TIMEOUT_MS)),
    ]);
    await rememberDriverKyc(result.kycStatus);
    return { status: result.kycStatus, fromServer: true };
  } catch {
    return { status: await lastDriverKyc(), fromServer: false };
  }
}

/* The server said "not approved" to something (going online): the dashboard sends them to verification. */
const listeners = new Set<() => void>();

export function onKycRequired(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitKycRequired(): void {
  forgetKnownDriverKyc();
  for (const listener of [...listeners]) listener();
}
