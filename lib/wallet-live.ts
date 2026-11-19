import { invalidateCached, patchCached } from '@/lib/cache-store';
import type { WalletTransaction } from '@/lib/api';
import { historyWithLive, overviewWithLive } from '@/lib/wallet-live-merge';

/**
 * The live wallet (19 Nov 2026): the server tells the app the moment money moves, from the database itself
 * (api-gateway src/wallet/live.ts), and the app changes what it keeps in place, with no fetch:
 *   wallet:live { balanceNgn, lockedNgn, … }  → the balance on every screen (and the copy on the phone)
 *   wallet:live { transaction }               → a new row on top of the money history
 * The older wallet:updated still comes; once wallet:live has been heard it is left alone (no second fetch).
 * After the connection dropped (news may have been missed) the wallet is fetched once; after a long drop the trips too.
 */
const KEPT_ROWS = 40;
let liveHeard = false;
let droppedAt: number | null = null;

export function applyWalletLive(payload: Record<string, unknown>): void {
  liveHeard = true;
  const row = payload.transaction;
  if (row && typeof row === 'object') {
    // A row whose details did not fit in the message: the history is fetched once for it.
    if (payload.incomplete === true) {
      invalidateCached('wallet.transactions');
      return;
    }
    patchCached('wallet.transactions', (kept) => historyWithLive(kept, row as WalletTransaction, KEPT_ROWS));
    return;
  }
  if (typeof payload.balanceNgn === 'number') {
    patchCached('wallet.overview', (kept) => overviewWithLive(kept, payload));
  }
}

/** The older wallet:updated: fetched again only when this server does not send wallet:live. */
export function onWalletUpdated(): void {
  if (!liveHeard) refetchWallet();
}

/** The balance and the money history only (never the deposit account, which does not change). */
function refetchWallet(): void {
  invalidateCached('wallet.overview');
  invalidateCached('wallet.transactions');
}

export function noteSocketClosed(now = Date.now()): void {
  if (droppedAt === null) droppedAt = now;
}

/** The socket is back: catch up on what may have been missed while it was down (never on the first connect). */
export function noteSocketOpened(now = Date.now(), extra: (droppedMs: number) => void = () => undefined): void {
  if (droppedAt === null) return;
  const droppedMs = now - droppedAt;
  droppedAt = null;
  refetchWallet();
  if (droppedMs > 60_000) {
    invalidateCached('trips');
    extra(droppedMs);
  }
}
