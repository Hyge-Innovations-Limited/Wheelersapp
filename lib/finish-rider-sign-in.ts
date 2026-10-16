import type { Router } from "expo-router";

import { storeLocalAccessToken } from "@/lib/access-token";
import type { PhoneLoginResponse } from "@/lib/api";
import { persistAuthenticatedRole } from "@/lib/auth-state";
import { termsChecked } from "@/lib/consent-sync";
import { clearNameNeeded, clearTermsToAnswer, markNameNeeded, markTermsToAnswer } from "@/lib/rider-sign-in-state";
import { firstNameOf } from "@/lib/rider-sign-in";
import { RIDER_TERMS_KEY, acceptTerms, hasAcceptedTerms } from "@/lib/terms-acceptance";

/**
 * Signed in, by an SMS code or a passkey: the same steps after either. The
 * login is kept, then the terms (asked only if the account has not agreed),
 * the email (only if the account has none), and the name for someone new, or
 * a welcome back.
 */
export async function finishRiderSignIn(
  result: PhoneLoginResponse,
  router: Pick<Router, "replace" | "canDismiss" | "dismissAll">,
  refreshAuthState: () => Promise<void>,
): Promise<void> {
  const name = result.user.name?.trim() ?? "";
  const needsName = result.isNewUser || !name;
  // Said before they are signed in, so closing the app on the name screen
  // comes back to the name screen.
  if (needsName) await markNameNeeded();
  else await clearNameNeeded();
  // The terms are agreed once for the account, in the app or on WhatsApp.
  // The server says which (an older server says nothing: then this phone's
  // own record stands). Agreed: never shown. Not yet: shown once, now.
  const agreed =
    result.privacyConsent === "AGREED" ||
    (result.privacyConsent === undefined && (await hasAcceptedTerms(RIDER_TERMS_KEY)));
  // Sign-in has asked the account itself: no older answer on this phone speaks for it.
  await termsChecked();
  if (agreed) {
    await acceptTerms(RIDER_TERMS_KEY);
    await clearTermsToAnswer();
  } else {
    await markTermsToAnswer();
  }
  await storeLocalAccessToken(result.accessToken);
  await persistAuthenticatedRole("RIDER");
  await refreshAuthState();

  // The sign-in screens are done with: Back from inside the app must not
  // walk into them again.
  if (router.canDismiss()) router.dismissAll();

  const after = needsName
    ? { pathname: "/rider-new", params: {} }
    : { pathname: "/rider-welcome-back", params: { name: firstNameOf(name), email: result.user.email ?? "" } };
  // Right after the privacy policy: their email, unless the account has one.
  const next = result.user.email?.trim()
    ? after
    : { pathname: "/rider-email", params: { next: JSON.stringify(after) } };
  if (agreed) {
    router.replace(next as never);
  } else {
    // Read, then Accept or Decline; either way they go on to where they were headed.
    router.replace({
      pathname: "/legal",
      params: { mode: "answer", who: RIDER_TERMS_KEY, next: JSON.stringify(next) },
    });
  }
}
