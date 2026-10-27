import { useCallback } from "react";

import {
  getWalletOverview,
  isBackendConfigured,
  type WalletOverviewResponse,
} from "@/lib/api";
import { invalidateCached, useCachedQuery } from "@/lib/cached-query";
import { withTimeout } from "@/lib/with-timeout";

type UseWalletOverviewResult = {
  overview: WalletOverviewResponse | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

/**
 * The balance, the withdrawal fee, and the account the last withdrawal went
 * to. Shown at once from the last copy (kept in the phone's secure storage:
 * it holds an account number), fetched again when it is 30 seconds old, when
 * the app comes back, and the moment the server says the wallet changed.
 */
export function useWalletOverview(): UseWalletOverviewResult {
  const query = useCachedQuery<WalletOverviewResponse>({
    key: "wallet.overview",
    fetcher: (accessToken) => getWalletOverview({ accessToken }),
    staleMs: 30_000,
    storage: "secure",
    enabled: isBackendConfigured(),
  });
  const { refresh } = query;
  return {
    overview: query.data,
    isLoading: query.loading,
    error: query.error,
    refresh: useCallback(() => refresh(), [refresh]),
  };
}

/**
 * The wallet changed (a wallet:updated event, a withdrawal, a pull to
 * refresh): every screen showing it fetches it again now.
 */
export function invalidateWalletCache(): void {
  invalidateCached("wallet");
}

/**
 * Kept for the splash screen. The last copy is on the phone now, so the home
 * screen shows it at once without a head start.
 */
export async function prefetchWalletOverview(
  _getAccessToken: () => Promise<string | null | undefined>,
): Promise<void> {
  return;
}

/**
 * The balance as the server has it right now (not the kept copy), for a
 * decision that holds money. Null when it cannot be had; every screen
 * showing the wallet fetches it again too.
 */
export async function fetchFreshBalanceNgn(
  getAccessToken: () => Promise<string | null | undefined>,
  /** No answer by then: null (the search goes out without auto-booking, never hangs). */
  timeoutMs = 4_000,
): Promise<number | null> {
  return withTimeout(
    (async () => {
      try {
        const accessToken = await getAccessToken();
        if (!accessToken) return null;
        const overview = await getWalletOverview({ accessToken });
        invalidateWalletCache();
        return typeof overview.balanceNgn === "number" && Number.isFinite(overview.balanceNgn) ? overview.balanceNgn : null;
      } catch {
        return null;
      }
    })(),
    timeoutMs,
    null,
  );
}
