import { useEffect, useRef } from "react";
import { Alert, AppState } from "react-native";
import { useRouter, type Href } from "expo-router";

import { getStoredLocalAccessToken, storeLocalAccessToken } from "@/lib/access-token";
import { checkSession, refreshAccessToken } from "@/lib/api";
import { publicEntryRoute } from "@/lib/app-variant";
import { useAuth } from "@/lib/auth";
import { renewSessionIfDue } from "@/lib/session-renewal";

/** Coming back to the app checks the login at most this often. */
const CHECK_EVERY_MS = 60_000;

/**
 * Keeps people signed in: when the app opens or comes back to the front, a
 * login over a day old is quietly swapped for a fresh 30-day one. A login
 * that has really ended is cleared, and the person is taken to sign in with
 * one clear message, instead of every screen failing on its own.
 */
export function SessionKeeper() {
  const router = useRouter();
  const { logout, refreshAuthState } = useAuth();
  const lastCheck = useRef(0);
  const ending = useRef(false);

  useEffect(() => {
    const check = async () => {
      if (ending.current || Date.now() - lastCheck.current < CHECK_EVERY_MS) return;
      lastCheck.current = Date.now();
      const outcome = await renewSessionIfDue({
        getToken: getStoredLocalAccessToken,
        refresh: (token) => refreshAccessToken(token),
        store: storeLocalAccessToken,
        // Signed out from the dashboard: found out here, on opening the app, not screen by screen.
        stillValid: (token) => checkSession(token),
      }).catch(() => "offline" as const);

      if (outcome === "renewed") {
        await refreshAuthState();
        return;
      }
      if (outcome !== "ended") return;
      ending.current = true;
      await logout().catch(() => undefined);
      router.replace(publicEntryRoute as Href);
      Alert.alert("Please sign in again", "Your login has ended. Sign in to carry on where you left off.");
      ending.current = false;
    };

    // The first check waits for the app's screens to be in place before it may move anyone.
    const first = setTimeout(() => void check(), 1500);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void check();
    });
    return () => {
      clearTimeout(first);
      subscription.remove();
    };
  }, [logout, refreshAuthState, router]);

  return null;
}
