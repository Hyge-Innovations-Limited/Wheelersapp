/**
 * The NIN popup (Timi, 18 Nov 2026): a rider with no NIN (or one that did not check out) is asked on Home, when
 * nothing else is going on. The server decides when it is due (every 3 days at most, never after 5 closes); the app
 * asks once per open and only when Home is idle.
 */
let askedThisRun = false;

/** Home is idle: no search or trip, the screen in front, no other sheet up. */
export function ninSheetMayOpen(input: { focused: boolean; rideActive: boolean; otherSheet: boolean }): boolean {
  return input.focused && !input.rideActive && !input.otherSheet && !askedThisRun;
}

export function markNinAsked(): void {
  askedThisRun = true;
}

/** 11 digits, spaces and dashes taken out; null when it is not a NIN. */
export function cleanNinInput(raw: string): string | null {
  const digits = raw.replace(/[\s-]/g, "");
  return /^\d{11}$/.test(digits) ? digits : null;
}
