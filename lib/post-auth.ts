import { checkDriverKyc, routeForKyc } from "@/lib/driver-kyc";
import {
  getAuthenticatedRoute,
  type AuthenticatedRoute,
  type StoredAuthState,
} from "@/lib/auth-state";

export type PostAuthRoute =
  | AuthenticatedRoute
  | "/driver/onboarding/pending"
  | "/driver/onboarding/welcome";

/**
 * Where a freshly authenticated user belongs.
 *
 * Drivers must clear KYC before the dashboard is any use to them, so their
 * route depends on the backend's verification state rather than the stored
 * role alone. Every sign-in path has to agree on this — routing straight to
 * the dashboard would drop an unverified driver onto a screen that lets them
 * go online without ever submitting documents.
 */
export async function resolvePostAuthRoute(
  state: StoredAuthState,
  accessToken: string,
): Promise<PostAuthRoute> {
  if (state.role !== "DRIVER") {
    return getAuthenticatedRoute(state);
  }

  // The server's answer; when it cannot be reached, its last answer. Never
  // known at all: onboarding, not a dashboard they may not be entitled to.
  const { status } = await checkDriverKyc(accessToken);
  return routeForKyc(status);
}
