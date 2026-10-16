import { useRouter } from "expo-router";
import { useEffect } from "react";

import { getAccessTokenWithRetry } from "@/lib/access-token";
import { getCurrentProfile } from "@/lib/api";
import { useAuth } from "@/lib/auth";

/** Asked once each time the app is opened, so "carry on for now" is never a loop. */
let checkedThisRun = false;

/**
 * Anyone signed up before the app asked for an email is asked once: the
 * first time Home opens, the server says whether the account has one, and if
 * not, the email screen comes up over Home. A failed check asks nothing.
 */
export function useEmailGate(): void {
  const router = useRouter();
  const { getAccessToken, isReady, user } = useAuth();

  useEffect(() => {
    if (!isReady || !user || checkedThisRun) return;
    checkedThisRun = true;
    void (async () => {
      const accessToken = await getAccessTokenWithRetry(getAccessToken).catch(() => null);
      if (!accessToken) return;
      const profile = await getCurrentProfile({ accessToken }).catch(() => null);
      if (profile && !profile.user.email?.trim()) router.push("/rider-email");
    })();
  }, [getAccessToken, isReady, router, user]);
}
