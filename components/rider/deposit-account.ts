import { useCallback, useEffect, useRef, useState } from "react";

import { getAccessTokenWithRetry } from "@/lib/access-token";
import {
  ApiError,
  getWalletDepositInfo,
  isBackendConfigured,
  provisionVirtualAccount,
  type WalletDepositInfoResponse,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useCachedQuery } from "@/lib/cached-query";

export type DepositAccount = WalletDepositInfoResponse;

export type DepositAccountState =
  | { status: "loading" }
  | { status: "ready"; account: DepositAccount }
  /** The bank accepted the request and has not sent the number yet. */
  | { status: "pending"; message: string }
  /** The bank will not open an account without a verified phone number. */
  | { status: "phone-required"; message: string }
  /** They declined the terms: no account is opened until they accept. */
  | { status: "terms-required"; message: string }
  | { status: "error"; message: string }
  /** No account, and this screen does not open one. */
  | { status: "none" };

type Flow = Exclude<DepositAccountState, { status: "none" }> | { status: "idle" };

const PENDING_FALLBACK = "Your account number is being prepared. Check back in a moment.";
const POLL_MS = 5000;
const MAX_POLLS = 12;

function isNotFound(error: unknown): boolean {
  if (error instanceof ApiError && (error.status === 404 || error.code === "VIRTUAL_ACCOUNT_NOT_FOUND")) {
    return true;
  }
  return error instanceof Error && error.message.includes("404");
}

/**
 * The rider's own account number, the one a bank transfer funds the wallet
 * through.
 *
 * It never changes once opened, so the last copy is kept in the phone's
 * secure storage and shown at once. With `provision`, a rider who has none
 * yet gets one opened: the server may answer with the account, say it is
 * still being prepared (then this asks again every few seconds), or say a
 * verified phone number is needed first.
 */
export function useDepositAccount(options: { provision: boolean }): DepositAccountState & {
  reload: () => Promise<void>;
} {
  const { getAccessToken, isReady } = useAuth();
  const cached = useCachedQuery<WalletDepositInfoResponse>({
    key: "wallet.deposit-info",
    fetcher: (accessToken) => getWalletDepositInfo({ accessToken }),
    staleMs: 24 * 60 * 60 * 1000,
    storage: "secure",
    enabled: isBackendConfigured(),
  });
  const refreshCached = cached.refresh;
  const [flow, setFlow] = useState<Flow>({ status: "idle" });
  const alive = useRef(true);
  const polls = useRef(0);
  const started = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(
    async (quiet?: boolean): Promise<void> => {
      if (!quiet) {
        polls.current = 0;
        setFlow({ status: "loading" });
      }
      let next: Flow;
      try {
        const accessToken = await getAccessTokenWithRetry(getAccessToken);
        if (!accessToken) throw new Error("Not authenticated");

        try {
          const info = await getWalletDepositInfo({ accessToken });
          next = { status: "ready", account: info };
        } catch (fetchError) {
          // 404 means no account yet: open one.
          if (!isNotFound(fetchError)) throw fetchError;
          const provisioned = await provisionVirtualAccount({ accessToken });
          if (provisioned.accountNumber) {
            next = {
              status: "ready",
              account: {
                accountNumber: provisioned.accountNumber,
                accountName: provisioned.accountName,
                bankName: provisioned.bankName,
                currency: provisioned.currency,
              },
            };
          } else {
            const message = (provisioned as { message?: unknown }).message;
            next = {
              status: "pending",
              message: typeof message === "string" && message ? message : PENDING_FALLBACK,
            };
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not load deposit info.";
        next =
          error instanceof ApiError && error.code === "PHONE_REQUIRED"
            ? { status: "phone-required", message }
            : error instanceof ApiError && error.code === "CONSENT_REQUIRED"
              ? { status: "terms-required", message }
              : { status: "error", message };
      }
      if (!alive.current) return;
      setFlow(next);
      // Other screens showing the account number pick it up from the kept copy.
      if (next.status === "ready") void refreshCached();
    },
    [getAccessToken, refreshCached],
  );

  useEffect(() => {
    if (!options.provision || !isReady || started.current) return;
    started.current = true;
    void load();
  }, [isReady, load, options.provision]);

  // Still being prepared: ask again in a moment, for about a minute.
  useEffect(() => {
    if (flow.status !== "pending" || polls.current >= MAX_POLLS) return;
    const timeout = setTimeout(() => {
      polls.current += 1;
      void load(true);
    }, POLL_MS);
    return () => clearTimeout(timeout);
  }, [flow, load]);

  const reloadWithFlow = useCallback(() => load(), [load]);
  const reload = options.provision ? reloadWithFlow : refreshCached;

  const account =
    flow.status === "ready" ? flow.account : cached.data?.accountNumber ? cached.data : null;
  if (account) return { status: "ready", account, reload };
  if (!options.provision) return { status: "none", reload };
  if (flow.status === "idle") return { status: "loading", reload };
  return { ...flow, reload };
}
