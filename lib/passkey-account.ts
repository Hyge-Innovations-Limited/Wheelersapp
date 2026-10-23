import * as SecureStore from "expo-secure-store";
import { useEffect } from "react";
import { Alert } from "react-native";

import { getAccessTokenWithRetry } from "@/lib/access-token";
import { getCurrentProfile, listPasskeys, passkeyRegistrationOptions, savePasskey } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toUserMessage } from "@/lib/error-messages";
import { makePasskey, PASSKEY_OFFERED_KEY, PasskeyCancelled, passkeysAvailable, rememberPasskeyHere, thisDeviceName } from "@/lib/passkeys";
import { firstNameOf } from "@/lib/rider-sign-in";

const OFFERED_KEY = PASSKEY_OFFERED_KEY;

/** Makes a passkey on this phone for the signed-in account. Throws PasskeyCancelled when they close the prompt. */
export async function addPasskeyForThisPhone(accessToken: string): Promise<void> {
  const options = await passkeyRegistrationOptions({ accessToken });
  const response = await makePasskey(options);
  await savePasskey({ accessToken, response, deviceName: thisDeviceName() });
  // Next sign-in on this phone offers the passkey first, greeting them by name.
  const profile = await getCurrentProfile({ accessToken }).catch(() => null);
  await rememberPasskeyHere(profile?.user.name ? firstNameOf(profile.user.name) : null);
}

/** Asked once of each signed-in account on this phone. */
let askedThisRun = false;

/**
 * After sign-up, once: "Sign in faster next time". Only on a phone and build
 * where passkeys work, and only when the account has none yet. Not asked
 * again after Not now; turning it on later is on the Security screen.
 */
export function usePasskeyOffer(skip: boolean): void {
  const { getAccessToken, isReady, user } = useAuth();

  useEffect(() => {
    if (skip || askedThisRun || !isReady || !user || !passkeysAvailable()) return;
    askedThisRun = true;
    void (async () => {
      if (await SecureStore.getItemAsync(OFFERED_KEY).catch(() => null)) return;
      const accessToken = await getAccessTokenWithRetry(getAccessToken).catch(() => null);
      if (!accessToken) return;
      // No email yet: the email screen comes first; this is asked on a later visit.
      const profile = await getCurrentProfile({ accessToken }).catch(() => null);
      if (!profile?.user.email?.trim()) return;
      const mine = await listPasskeys({ accessToken }).catch(() => null);
      if (!mine || mine.passkeys.length > 0) return;
      await SecureStore.setItemAsync(OFFERED_KEY, "1").catch(() => undefined);
      Alert.alert(
        "Sign in faster next time",
        "Use Face ID or your fingerprint to sign in, instead of waiting for a text message. You can turn it off any time in Security.",
        [
          { text: "Not now", style: "cancel" },
          {
            text: "Turn on",
            onPress: () =>
              void addPasskeyForThisPhone(accessToken)
                .then(() => Alert.alert("Passkey on", "Next time, tap Sign in with a passkey."))
                .catch((error: unknown) => {
                  if (error instanceof PasskeyCancelled) return;
                  Alert.alert("Not turned on", toUserMessage(error, "The passkey could not be set up. You can try again in Security."));
                }),
          },
        ],
      );
    })();
  }, [getAccessToken, isReady, skip, user]);
}

