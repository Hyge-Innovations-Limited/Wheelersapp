import AsyncStorage from "@react-native-async-storage/async-storage";

import { getPrivacyConsent, recordPrivacyConsent } from "@/lib/api";
import { DRIVER_TERMS_KEY, RIDER_TERMS_KEY, acceptTerms, hasAcceptedTerms } from "@/lib/terms-acceptance";

/**
 * The terms are agreed once for the account, in the app or on WhatsApp.
 * Before that was so, accepting in the app was remembered only on the phone,
 * and WhatsApp asked the same person again. This carries that old answer up
 * to the account, once per install, for whoever is signed in when the app
 * first opens after the change. From then on sign-in does the asking.
 */
const CARRIED_KEY = "wheelers.terms.carried-to-account";

/** Sign-in under the new rule has dealt with it: nothing old to carry. */
export async function termsCarried(): Promise<void> {
  await AsyncStorage.setItem(CARRIED_KEY, "1").catch(() => undefined);
}

export async function carryTermsToAccount(accessToken: string): Promise<void> {
  try {
    if ((await AsyncStorage.getItem(CARRIED_KEY)) === "1") return;
    const acceptedHere = (await hasAcceptedTerms(RIDER_TERMS_KEY)) || (await hasAcceptedTerms(DRIVER_TERMS_KEY));
    if (acceptedHere) {
      await recordPrivacyConsent(accessToken, "AGREED");
    } else if ((await getPrivacyConsent(accessToken)).privacyConsent === "AGREED") {
      // Agreed on WhatsApp: this phone need not ask.
      await acceptTerms(RIDER_TERMS_KEY);
    }
    await termsCarried();
  } catch {
    // The server could not be reached, or is an older one: tried again next time the app opens.
  }
}
