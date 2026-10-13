import { recordPrivacyConsent } from "@/lib/api";
import { checkDriverKyc, routeForKyc } from "@/lib/driver-kyc";
import { DRIVER_TERMS_KEY, hasAcceptedTerms } from "@/lib/terms-acceptance";
import {
  getAuthenticatedRoute,
  type AuthenticatedRoute,
  type StoredAuthState,
} from "@/lib/auth-state";

/** The driver's acceptance has been sent to their account during this run of the app. */
let driverTermsSent = false;

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

  // A driver accepts the terms on this phone before signing in. That answer
  // goes on their account, so WhatsApp does not ask them again. Once per run.
  if (!driverTermsSent) {
    driverTermsSent = true;
    void hasAcceptedTerms(DRIVER_TERMS_KEY)
      .then((accepted) => (accepted ? recordPrivacyConsent(accessToken, "AGREED") : undefined))
      .catch(() => {
        driverTermsSent = false;
      });
  }

  // The server's answer; when it cannot be reached, its last answer. Never
  // known at all: onboarding, not a dashboard they may not be entitled to.
  const { status } = await checkDriverKyc(accessToken);
  return routeForKyc(status);
}
