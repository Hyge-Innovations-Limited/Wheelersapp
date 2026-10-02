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
  // Rejected: the screen that says what to fix and why, not the start.
  if (status === "SUBMITTED" || status === "REJECTED") return "/driver/onboarding/pending";
  return "/driver/onboarding/welcome";
}

/**
 * The lock: where a driver on this screen must be sent, or null to stay.
 * `segments` are the route's (e.g. ["driver", "(tabs)", "home"]); status
 * undefined means not known yet (wait, the screen stays covered).
 *   approved            → anywhere
 *   submitted           → only "Under review"
 *   rejected            → "What to fix" (the pending screen), then the steps
 *   anything else       → only the verification steps
 */
export function kycLockTarget(status: string | null | undefined, segments: string[]): DriverKycRoute | null {
  if (status === undefined || status === "APPROVED") return null;
  const inOnboarding = segments[0] === "driver" && segments[1] === "onboarding";
  if (!inOnboarding) return routeForKyc(status);
  if (status === "SUBMITTED" && segments[2] !== "pending") return "/driver/onboarding/pending";
  return null;
}

/** Whether this screen is hidden while the driver is moved (or while the answer is awaited). */
export function kycLockCovers(status: string | null | undefined, segments: string[]): boolean {
  const inOnboarding = segments[0] === "driver" && segments[1] === "onboarding";
  return !inOnboarding && status !== "APPROVED";
}

/** Ask the server; when it cannot be reached, fall back to its last answer. */
export async function checkDriverKyc(accessToken: string): Promise<{ status: string | null; fromServer: boolean }> {
  try {
    const result = await Promise.race([
      getDriverKycStatus({ accessToken }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("KYC check timed out")), CHECK_TIMEOUT_MS)),
    ]);
    noteDriverKyc(result.kycStatus);
    return { status: result.kycStatus, fromServer: true };
  } catch {
    return { status: await lastDriverKyc(), fromServer: false };
  }
}

/* Every fresh answer from the server, wherever it was asked (the pending screen polls). */
const changeListeners = new Set<(status: string) => void>();

/** A fresh answer from the server, got elsewhere (the pending screen's own poll). */
export function noteDriverKyc(status: string): void {
  void rememberDriverKyc(status);
  for (const listener of [...changeListeners]) listener(status);
}

export function onDriverKycChange(listener: (status: string) => void): () => void {
  changeListeners.add(listener);
  return () => changeListeners.delete(listener);
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
