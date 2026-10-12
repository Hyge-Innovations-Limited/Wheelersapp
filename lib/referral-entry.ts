import { applyReferralCode } from "@/lib/api";

/** What a referral code may be made of, as it is typed: capitals and digits, twelve at most. */
export const tidyReferralCode = (typed: string) => typed.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);

/** The shortest a referral code can be. */
export const REFERRAL_CODE_MIN = 4;

/** The sentence under the box when a code typed at sign-up is refused; null when it should not stop them. */
export function referralRefusalAtSignUp(reason: string): string | null {
  // One is on the account already (they tapped twice, or came back to this step): nothing to fix.
  if (/already/i.test(reason)) return null;
  if (/own referral code/i.test(reason)) return "That is your own code. Enter the one someone gave you, or leave this empty.";
  if (/not found|invalid|inactive/i.test(reason)) return "That code was not found. Check it, or leave this empty.";
  return "That code could not be added just now. Try again, or leave this empty.";
}

/**
 * Adds the code someone typed while signing up. Resolves to null when there is
 * nothing to show (it was added, the box was empty, or one was already on the
 * account), or to the sentence to put under the box.
 */
export async function addReferralAtSignUp(accessToken: string, typed: string): Promise<string | null> {
  const code = tidyReferralCode(typed);
  if (!code) return null;
  if (code.length < REFERRAL_CODE_MIN) return "A referral code is 4 to 12 letters or numbers.";
  try {
    await applyReferralCode({ accessToken, code });
    return null;
  } catch (failure) {
    return referralRefusalAtSignUp(failure instanceof Error ? failure.message : "");
  }
}
