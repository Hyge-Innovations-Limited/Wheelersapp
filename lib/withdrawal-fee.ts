/**
 * The Wheelers withdrawal fee, as the server states it.
 *
 * The fee comes out of the amount: withdraw ₦5,000, the wallet falls by
 * ₦5,000 and the bank receives ₦4,955. The app never holds its own copy of
 * the number. The wallet overview carries it, so a change on the server is
 * shown here without an app update, and a server that charges nothing
 * (older than the fee) shows nothing.
 */

export interface WithdrawalFeeTerms {
  withdrawalFeeNgn?: number | null;
  minWithdrawalNgn?: number | null;
}

export interface WithdrawalBreakdown {
  amountNgn: number;
  feeNgn: number;
  receiveNgn: number;
}

const kobo = (n: number) => Math.round(n * 100) / 100;

export function withdrawalFeeOf(terms: WithdrawalFeeTerms | null | undefined): number {
  const fee = Number(terms?.withdrawalFeeNgn ?? 0);
  return Number.isFinite(fee) && fee > 0 ? fee : 0;
}

/** The least that can be withdrawn. 0 when the server has not said. */
export function minWithdrawalOf(terms: WithdrawalFeeTerms | null | undefined): number {
  const min = Number(terms?.minWithdrawalNgn ?? 0);
  return Number.isFinite(min) && min > 0 ? min : 0;
}

export function withdrawalBreakdown(amountNgn: number, feeNgn: number): WithdrawalBreakdown {
  const amount = kobo(Math.max(0, amountNgn || 0));
  const fee = kobo(Math.min(amount, Math.max(0, feeNgn)));
  return { amountNgn: amount, feeNgn: fee, receiveNgn: kobo(amount - fee) };
}
