/**
 * The live wallet's changes to the kept copies (no imports, so tests read it alone). See lib/wallet-live.ts.
 */
type Row = { id: string; createdAt?: string };

/** The overview's fields a live balance message carries (the rest, like the payout account, are kept as they are). */
const OVERVIEW_FIELDS = ['balanceNgn', 'lockedNgn', 'updatedAt', 'cashRides', 'owedNgn', 'owedLimitNgn', 'driverPaused', 'depositToDriveNgn'] as const;

/** The kept overview with the live balance in it. Null: nothing kept to change. */
export function overviewWithLive(kept: unknown, live: Record<string, unknown>): Record<string, unknown> | null {
  if (!kept || typeof kept !== 'object') return null;
  const next: Record<string, unknown> = { ...(kept as Record<string, unknown>) };
  for (const field of OVERVIEW_FIELDS) if (field in live) next[field] = live[field];
  // An older message (the database's own time) never undoes a newer one.
  const keptAt = Date.parse(String((kept as Record<string, unknown>).updatedAt ?? ''));
  const liveAt = Date.parse(String(live.updatedAt ?? ''));
  if (Number.isFinite(keptAt) && Number.isFinite(liveAt) && liveAt < keptAt) return null;
  return next;
}

/** The kept money history with a new row on top (newest first), once, at most `keep` rows. Null: nothing to change. */
export function historyWithLive<T extends Row>(kept: unknown, row: T, keep: number): T[] | null {
  if (!Array.isArray(kept)) return null;
  const list = kept as T[];
  if (list.some((t) => t.id === row.id)) return null;
  const next = [row, ...list];
  next.sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
  return next.slice(0, keep);
}
