/** "28:14" for a wait of 1,694 seconds; "0:42" under a minute. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** "28 minutes", "1 minute", "42 seconds": a wait said in words. */
export function waitWords(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  if (s < 60) return s === 1 ? "1 second" : `${s} seconds`;
  const m = Math.ceil(s / 60);
  return m === 1 ? "1 minute" : `${m} minutes`;
}

/** Seconds left until a moment (ms since 1970), never below zero. */
export function secondsUntil(deadlineMs: number | null, nowMs: number): number {
  return deadlineMs === null ? 0 : Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000));
}

/** "08031234567" for "+2348031234567": how a Nigerian number is typed. Anything else comes back as it was. */
export function localNumber(phone: string | null | undefined): string {
  if (!phone) return "";
  return phone.startsWith("+234") ? `0${phone.slice(4)}` : phone;
}

/** Is this a Nigerian mobile number, typed any usual way? (The server decides; this only enables the button.) */
export function looksLikeNigerianMobile(typed: string): boolean {
  const digits = typed.replace(/[\s()-]/g, "").replace(/^\+/, "");
  const national = digits.startsWith("234") ? digits.slice(3) : digits.startsWith("0") ? digits.slice(1) : digits;
  return /^[789][01]\d{8}$/.test(national);
}
