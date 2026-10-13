import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { getAccessTokenWithRetry } from "@/lib/access-token";
import { isDriverApp } from "@/lib/app-variant";
import { useAuth } from "@/lib/auth";
import { listInterstateOffers } from "@/lib/interstate";

/**
 * How many passenger requests are waiting on this driver.
 *
 * Lives above the tab bar rather than inside the Interstate screen, because the
 * whole point is that a driver sitting on Home finds out a request came in —
 * without having to think to go and look. The screen itself only ever shows the
 * badge for a tab you are already on, which is the one place it is useless.
 */

type InterstateRequestsValue = {
  pendingCount: number;
  refresh: () => void;
};

const defaultValue: InterstateRequestsValue = {
  pendingCount: 0,
  refresh: () => undefined,
};

const InterstateRequestsContext =
  createContext<InterstateRequestsValue>(defaultValue);

/**
 * Intercity is not offered to drivers yet (its tab is hidden), so nothing asks
 * the server for requests. Left on, every signed-in driver's phone asked every
 * half-minute, and one still in verification was refused each time: noise for
 * them, and a false "problem" on the admin Activity page. Turn back on with the tab.
 */
const INTERCITY_FOR_DRIVERS = false;

/** How often to look. Slow on purpose — an interstate trip is not a hail. */
const POLL_MS = 30_000;

export function InterstateRequestsProvider({ children }: { children: ReactNode }) {
  const { getAccessToken, isReady, user } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);
  const [nonce, setNonce] = useState(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(() => setNonce((current) => current + 1), []);

  useEffect(() => {
    // Riders never see this badge, and polling for them would be a request per
    // half-minute that nothing reads.
    if (!INTERCITY_FOR_DRIVERS || !isDriverApp || !isReady || !user) {
      setPendingCount(0);
      return;
    }

    let cancelled = false;

    const poll = async () => {
      try {
        const accessToken = await getAccessTokenWithRetry(getAccessToken);
        if (!accessToken || cancelled) return;
        const result = await listInterstateOffers(accessToken);
        if (!cancelled && mountedRef.current) setPendingCount(result.offers.length);
      } catch {
        // A failed poll keeps the last known count. Zeroing the badge on a
        // blip would tell a driver their requests had gone away.
      }
    };

    void poll();
    const timer = setInterval(() => void poll(), POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [getAccessToken, isReady, user, nonce]);

  const value = useMemo(() => ({ pendingCount, refresh }), [pendingCount, refresh]);

  return (
    <InterstateRequestsContext.Provider value={value}>
      {children}
    </InterstateRequestsContext.Provider>
  );
}

export function useInterstateRequests(): InterstateRequestsValue {
  return useContext(InterstateRequestsContext);
}
