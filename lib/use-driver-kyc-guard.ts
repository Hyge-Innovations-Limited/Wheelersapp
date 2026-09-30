import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { getAccessTokenWithRetry } from "@/lib/access-token";
import { publicEntryRoute } from "@/lib/app-variant";
import { useAuth } from "@/lib/auth";
import { checkDriverKyc, knownDriverKyc, onKycRequired, routeForKyc } from "@/lib/driver-kyc";

/** Coming back to the app re-checks at most this often. */
const RECHECK_MS = 60_000;

/**
 * The driver dashboard's own door: whatever route led here (reopening the
 * app, a notification, a stale screen), a driver the server has not APPROVED
 * is sent to verification. Checked when the dashboard opens, when the app
 * comes back to the front, and whenever the server refuses a driver for KYC.
 * True once the dashboard may show.
 */
export function useDriverKycGuard(): boolean {
  const router = useRouter();
  const { getAccessToken } = useAuth();
  const [allowed, setAllowed] = useState(knownDriverKyc() === "APPROVED");
  const lastCheck = useRef(0);
  const leaving = useRef(false);

  const check = useCallback(async () => {
    if (leaving.current) return;
    lastCheck.current = Date.now();
    const token = await getAccessTokenWithRetry(getAccessToken);
    if (!token) {
      leaving.current = true;
      router.replace(publicEntryRoute as never);
      return;
    }
    const { status } = await checkDriverKyc(token);
    if (status === "APPROVED") {
      setAllowed(true);
      return;
    }
    leaving.current = true;
    setAllowed(false);
    router.replace(routeForKyc(status) as never);
  }, [getAccessToken, router]);

  useEffect(() => {
    void check();
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active" && Date.now() - lastCheck.current > RECHECK_MS) void check();
    });
    const off = onKycRequired(() => void check());
    return () => {
      appState.remove();
      off();
    };
  }, [check]);

  return allowed;
}
