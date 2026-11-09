/**
 * A price the rider typed instead of stepping: to the nearest ₦50; under the
 * lowest allowed it becomes the lowest (with a note). Nothing usable typed
 * (empty, no digits, zero): null, and the price stays as it was.
 */
export const TYPED_PRICE_STEP_NGN = 50;

export function resolveTypedPrice(
  text: string,
  minNgn: number,
): { amount: number; low: boolean } | null {
  const digits = String(text ?? '').replace(/[^0-9]/g, '');
  const typed = digits ? Number(digits) : 0;
  if (!(typed > 0) || !Number.isFinite(typed)) return null;
  let amount = Math.round(typed / TYPED_PRICE_STEP_NGN) * TYPED_PRICE_STEP_NGN;
  if (amount < TYPED_PRICE_STEP_NGN) return null;
  let low = false;
  if (minNgn > 0 && amount < minNgn) {
    amount = minNgn;
    low = true;
  }
  return { amount, low };
}

/**
 * Typing is over (Done, blur, keyboard hidden, app in background, or -/+ pressed):
 * the price now, and whether to say "Lowest is". Unedited text, or nothing usable
 * typed, leaves the price as it was.
 */
export function settleTypedPrice(
  typed: string,
  startText: string,
  beforeNgn: number,
  minNgn: number,
): { amount: number; low: boolean; changed: boolean } {
  if (typed === startText) return { amount: beforeNgn, low: false, changed: false };
  const got = resolveTypedPrice(typed, minNgn);
  if (!got) return { amount: beforeNgn, low: false, changed: false };
  return { amount: got.amount, low: got.low, changed: got.amount !== beforeNgn };
}
