/**
 * What a driver reads when a trip is cancelled. Never a machine reason
 * ("driver_cancelled", "rider_no_show") — a person's words, or nothing.
 */

/** Reasons the server sends as codes, in words. */
const REASON_WORDS: Record<string, string> = {
  rider_no_show: "The rider didn't show up.",
  driver_no_show: "The trip was cancelled because you didn't reach the pickup.",
  timeout: 'The trip timed out.',
  payment_failed: "The rider's payment didn't go through.",
};

/** A code looks like `snake_case` or `SHOUTING_CASE`; a rider's own words don't. */
function looksLikeCode(reason: string): boolean {
  return /^[a-z0-9]+(_[a-z0-9]+)+$/i.test(reason) || /^[A-Z0-9_]+$/.test(reason);
}

/**
 * The alert for a cancelled trip, or null when there should be none: the
 * driver cancelled it themselves, and they already know.
 */
export function driverCancelNotice(payload: { reason?: string; cancelledBy?: string }): { title: string; body: string } | null {
  if (payload.cancelledBy === 'driver' || payload.reason === 'driver_cancelled') return null;
  const reason = payload.reason?.trim();
  const said = reason
    ? REASON_WORDS[reason] ?? (looksLikeCode(reason) ? null : `They said: “${reason}”`)
    : null;
  if (payload.cancelledBy === 'system') {
    return { title: 'Trip cancelled', body: said ?? 'This trip was cancelled. You can keep taking other requests.' };
  }
  return {
    title: 'The rider cancelled',
    body: said ? `The rider cancelled this trip. ${said}` : 'The rider cancelled this trip. You can keep taking other requests.',
  };
}
