import AsyncStorage from "@react-native-async-storage/async-storage";

import { getPrivacyConsent } from "@/lib/api";
import { markTermsToAnswer } from "@/lib/rider-sign-in-state";
import { RIDER_TERMS_KEY, acceptTerms } from "@/lib/terms-acceptance";

/**
 * The terms are agreed once for the account, in the app or on WhatsApp, and
 * only the account's own record is believed. A tick left on a phone says
 * nothing about who made it (two people can share a phone), so it is never
 * sent up as anyone's answer.
 *
 * Sign-in asks the account. This covers the people who were already signed
 * in when that began: the first time the app opens, their account is asked
 * too. Agreed: nothing shows. Not agreed: a rider is shown the terms once,
 * like anyone signing in.
 */
const CHECKED_KEY = "wheelers.terms.account-checked";

/** Sign-in has asked the account: there is nothing left to check. */
export async function termsChecked(): Promise<void> {
  await AsyncStorage.setItem(CHECKED_KEY, "1").catch(() => undefined);
}

/** Signed out: whoever signs in next is asked afresh. */
export async function termsNotChecked(): Promise<void> {
  await AsyncStorage.removeItem(CHECKED_KEY).catch(() => undefined);
}

/**
 * Asks the account, once, for someone signed in before sign-in did the asking.
 * Resolves to "ask" when a rider's account has not agreed and the terms should
 * be shown; "nothing" otherwise (agreed, already checked, a driver, or the
 * server could not be reached, in which case it is tried again next time).
 */
export async function checkTermsForAccount(accessToken: string, role: "RIDER" | "DRIVER" | null): Promise<"ask" | "nothing"> {
  try {
    if ((await AsyncStorage.getItem(CHECKED_KEY)) === "1") return "nothing";
    const { privacyConsent } = await getPrivacyConsent(accessToken);
    await termsChecked();
    if (privacyConsent === "AGREED") {
      await acceptTerms(RIDER_TERMS_KEY);
      return "nothing";
    }
    // A driver accepts before signing in, each time they sign in on a phone.
    if (role !== "RIDER") return "nothing";
    await markTermsToAnswer();
    return "ask";
  } catch {
    return "nothing";
  }
}
