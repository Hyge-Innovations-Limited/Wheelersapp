import { useCallback } from "react";

import {
  getWalletTransactions,
  isBackendConfigured,
  type WalletTransaction,
} from "@/lib/api";
import { useCachedQuery } from "@/lib/cached-query";

type UseWalletTransactionsResult = {
  items: WalletTransaction[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

/** How many rows the money history keeps on the phone (every list shows its first ones). */
export const WALLET_HISTORY_KEPT = 40;
/** Fetched again by itself only this rarely: new rows arrive live (lib/wallet-live.ts). */
const HISTORY_FRESH_MS = 15 * 60_000;

/**
 * The money history: shown at once from the copy on the phone (even with no connection), never a spinner after the
 * first time. A new row arrives by itself the moment money moves (wallet:live); it is fetched again only when the
 * app has been away a while, after its connection dropped, or on a pull to refresh.
 */
export function useWalletTransactions(limit = 30): UseWalletTransactionsResult {
  const query = useCachedQuery<WalletTransaction[]>({
    key: "wallet.transactions",
    fetcher: (accessToken) => getWalletTransactions({ accessToken, limit: WALLET_HISTORY_KEPT }).then((r) => r.items),
    staleMs: HISTORY_FRESH_MS,
    enabled: isBackendConfigured(),
  });
  const { refresh } = query;
  return {
    items: (query.data ?? []).slice(0, limit),
    isLoading: query.loading,
    error: query.error,
    refresh: useCallback(() => refresh(), [refresh]),
  };
}
