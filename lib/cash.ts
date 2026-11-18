/**
 * Pay with cash (Timi, 18 Nov 2026). A rider may pay the driver in cash once the price is agreed (never a group
 * ride): nothing is held. At the end Wheelers' share comes out of the driver's wallet, below zero if it has to; a
 * driver owing more than ₦1,000 gets no new requests until they deposit. The server says all of it; these only read
 * what it said, so an older server (nothing said) shows no Cash and no debt.
 */
import type { WalletOverviewResponse } from '@/lib/api';

/** Cash may be offered at accept: only when the server says so. */
export function cashOffered(overview: Pick<WalletOverviewResponse, 'cashRides'> | null | undefined): boolean {
  return overview?.cashRides === true;
}

export type DriverOwed = { owedNgn: number; paused: boolean; depositNgn: number };

/** What a driver owes from cash trips, or null when nothing (or an older server). */
export function driverOwed(
  overview: Pick<WalletOverviewResponse, 'owedNgn' | 'driverPaused' | 'depositToDriveNgn'> | null | undefined,
): DriverOwed | null {
  const owed = typeof overview?.owedNgn === 'number' && Number.isFinite(overview.owedNgn) ? overview.owedNgn : 0;
  if (!(owed > 0)) return null;
  const deposit = typeof overview?.depositToDriveNgn === 'number' && overview.depositToDriveNgn > 0 ? overview.depositToDriveNgn : Math.ceil(owed);
  return { owedNgn: owed, paused: overview?.driverPaused === true, depositNgn: deposit };
}

/** A cash fare at the end: the driver collects all of it, and owes Wheelers what is not theirs. */
export function cashPayout(fareNgn: number, driverPayoutNgn: number): { collectNgn: number; owedNgn: number } {
  const fare = Number.isFinite(fareNgn) ? Math.max(0, fareNgn) : 0;
  const payout = Number.isFinite(driverPayoutNgn) ? Math.max(0, Math.min(fare, driverPayoutNgn)) : 0;
  return { collectNgn: fare, owedNgn: Math.round((fare - payout) * 100) / 100 };
}

/** The accept's paymentMethod: the server reads 'cash' as CASH, anything else as the wallet. */
export function acceptPaymentMethod(method: 'wallet' | 'cash' | undefined): 'cash' | 'wallet_balance' {
  return method === 'cash' ? 'cash' : 'wallet_balance';
}
