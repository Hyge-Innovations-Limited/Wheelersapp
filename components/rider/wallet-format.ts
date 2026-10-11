import type { Ionicons } from "@expo/vector-icons";

import { naira } from "@/constants/rider-theme";
import type { WalletTransaction } from "@/lib/api";

type IconName = keyof typeof Ionicons.glyphMap;

/** ₦6,000, or ₦4,955.50 when the amount really has kobo. Never rounds money away. */
export function money(amount: number | null | undefined): string {
  const value = Number.isFinite(amount as number) ? (amount as number) : 0;
  const rounded = Math.round(value * 100) / 100;
  if (Number.isInteger(rounded)) return naira(rounded);
  const [whole, kobo] = Math.abs(rounded).toFixed(2).split(".");
  return `${rounded < 0 ? "-" : ""}${naira(Number(whole))}.${kobo}`;
}

/** 9912483620 reads as 9912 483 620. Anything that is not ten digits is left alone. */
export function groupAccountNumber(accountNumber: string): string {
  const digits = accountNumber.replace(/\s/g, "");
  if (!/^\d{10}$/.test(digits)) return accountNumber;
  return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
}

export function transactionTitle(transaction: WalletTransaction): string {
  switch (transaction.type) {
    case "DEPOSIT":
    case "FIAT_ONRAMP":
    case "CRYPTO_DEPOSIT":
      return "Wallet funded";
    case "RIDE_PAYMENT":
      return "Ride payment";
    case "REFUND":
      return "Refund";
    case "WITHDRAWAL":
      return "Withdrawal";
    case "DRIVER_PAYOUT":
      return "Driver payout";
    case "DISPUTE_RESOLUTION":
      return "Dispute settled";
    case "PENALTY":
      return "Penalty";
    case "PLATFORM_FEE":
      return transaction.metadata?.["kind"] === "withdrawal_fee" ? "Withdrawal fee" : "Fee";
    case "PROVIDER_FEE":
      return "Fee";
    case "ADJUSTMENT":
      return "Adjustment";
    default: {
      const words = transaction.type.toLowerCase().replace(/_/g, " ").trim();
      return words ? words[0]!.toUpperCase() + words.slice(1) : "Transaction";
    }
  }
}

export function transactionIcon(transaction: WalletTransaction): IconName {
  switch (transaction.type) {
    case "DEPOSIT":
    case "FIAT_ONRAMP":
    case "CRYPTO_DEPOSIT":
      return "arrow-down";
    case "RIDE_PAYMENT":
      return "car-outline";
    case "REFUND":
      return "refresh";
    case "WITHDRAWAL":
      return "arrow-up";
    default:
      return transaction.direction === "CREDIT" ? "add" : "remove";
  }
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Today, 8:12", "Yesterday, 18:40", "7 Oct", "7 Oct 2025". */
export function transactionWhen(value: string, now: Date = new Date()): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  const time = `${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}`;

  if (days === 0) return `Today, ${time}`;
  if (days === 1) return `Yesterday, ${time}`;
  const day = `${date.getDate()} ${MONTHS[date.getMonth()]}`;
  return date.getFullYear() === now.getFullYear() ? day : `${day} ${date.getFullYear()}`;
}

export function transactionSignedAmount(transaction: WalletTransaction): string {
  return `${transaction.direction === "CREDIT" ? "+" : "−"} ${money(Math.abs(transaction.amountNgn))}`;
}
