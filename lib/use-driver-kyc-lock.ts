import { useRouter, useSegments } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { getAccessTokenWithRetry } from "@/lib/access-token";
import { publicEntryRoute } from "@/lib/app-variant";
import { useAuth } from "@/lib/auth";
import { checkDriverKyc, knownDriverKyc, kycLockCovers, kycLockTarget, onDriverKycChange, onKycRequired } from "@/lib/driver-kyc";

/** Coming back to the app re-asks the server at most this often. */
const RECHECK_MS = 30_000;

/**
 * The KYC lock over every driver screen. Until an admin approves them:
 *   - not submitted (or rejected): only the verification steps;
 *   - submitted: only the "Under review" screen;
 *   - never the dashboard, the wallet, a trip, anything else.
 * Whatever route they arrive by (reopening the app, a notification, back
 * gestures, an old screen), they are taken back by force. Returns true when
 * the current screen must be covered while they are moved.
 */
export function useDriverKycLock(): boolean {
  const router = useRouter();
  const segments = useSegments() as string[];
  const { getAccessToken } = useAuth();
  // undefined: not asked yet this session.
  const [status, setStatus] = useState<string | null | undefined>(knownDriverKyc() ?? undefined);
  const lastCheck = useRef(0);
  const signedOut = useRef(false);

  const route = segments.join("/");

  const check = useCallback(async () => {
    lastCheck.current = Date.now();
    const token = await getAccessTokenWithRetry(getAccessToken);
    if (!token) {
      signedOut.current = true;
      router.replace(publicEntryRoute as never);
      return;
    }
    const result = await checkDriverKyc(token);
    setStatus(result.status);
  }, [getAccessToken, router]);

  useEffect(() => {
    void check();
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active" && Date.now() - lastCheck.current > RECHECK_MS) void check();
    });
    const offChange = onDriverKycChange((next) => setStatus(next));
    const offRequired = onKycRequired(() => void check());
    return () => {
      appState.remove();
      offChange();
      offRequired();
    };
  }, [check]);

  // Enforce on every move, not only at launch.
  useEffect(() => {
    if (signedOut.current) return;
    const target = kycLockTarget(status, route.split("/"));
    if (target) router.replace(target as never);
  }, [status, route, router]);

  return kycLockCovers(status, segments);
}
