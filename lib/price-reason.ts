import { naira } from "@/constants/rider-theme";

/** Why the suggested price is up right now, from the server's estimate (newer servers only). */
export type PriceReason = { label: string; extraNgn: number };

/** The server's `priceReason`, or null when it is missing, empty or not worth a line. */
export function parsePriceReason(value: unknown): PriceReason | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { label, extraNgn } = value as Record<string, unknown>;
  if (typeof label !== "string" || label.trim().length === 0) return null;
  if (typeof extraNgn !== "number" || !Number.isFinite(extraNgn) || extraNgn <= 0) return null;
  return { label: label.trim(), extraNgn: Math.round(extraNgn) };
}

/** "Busy in this area · +₦1,200", or null. */
export function priceReasonLine(value: unknown): string | null {
  const reason = parsePriceReason(value);
  return reason ? `${reason.label} · +${naira(reason.extraNgn)}` : null;
}

/** Two reasons say the same thing. */
export function samePriceReason(left: unknown, right: unknown): boolean {
  return priceReasonLine(left) === priceReasonLine(right);
}
