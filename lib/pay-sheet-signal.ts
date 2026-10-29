/**
 * Tells the server the rider has the pay sheet open for one driver, so that
 * driver sees "Rider accepted · paying now". Fire and forget: nothing here
 * changes what the rider sees, and nothing here ever throws.
 */

/** The driver id is Driver.id, the same one ride:accept_offer takes. */
export type SendPaySheet = (driverId: string, open: boolean) => void;

export type PaySheetTracker = {
  /** The sheet is gone: closes once. Safe to call again. */
  dispose: () => void;
};

/**
 * One open now, one close later, however the sheet ends. Call `dispose` on
 * every exit (Back, swipe down, Keep looking, another driver, booked,
 * cancelled, unmount). Going to the background does not close it: the rider
 * leaves for the bank app while adding money. A close lost while the socket is
 * down is covered by the server's 10-minute TTL.
 */
export function trackPaySheet(send: SendPaySheet, driverId: string): PaySheetTracker {
  let isOpen = false;
  let done = false;
  const open = () => {
    if (isOpen || done) return;
    isOpen = true;
    safe(send, driverId, true);
  };
  const close = () => {
    if (!isOpen) return;
    isOpen = false;
    safe(send, driverId, false);
  };
  open();
  return {
    dispose: () => {
      close();
      done = true;
    },
  };
}

function safe(send: SendPaySheet, driverId: string, open: boolean): void {
  try {
    send(driverId, open);
  } catch {
    // Never slows or breaks paying.
  }
}

/**
 * Is this socket error the answer to a pay-sheet message? An older server (or
 * the flag off) says "Unknown event type: ride:pay_sheet" with no requestType;
 * a live one tags its refusals with requestType. Those are dropped without a
 * word. Any other error (an accept refused, say) is never matched here.
 */
export function isPaySheetError(type: string, payload: { requestType?: unknown; message?: unknown }): boolean {
  if (type !== 'error') return false;
  return payload.requestType === 'ride:pay_sheet' || payload.message === 'Unknown event type: ride:pay_sheet';
}

/** Who the server is told about: the sheet's driver, else the one being accepted, else the one gone to add money. */
export function payingDriverId(input: {
  sheetDriverId: string | null;
  acceptingFor: string | null;
  addMoneyFor: string | null;
}): string | null {
  return input.sheetDriverId ?? input.acceptingFor ?? input.addMoneyFor;
}

/** The accept is over (not sending, and the ride is no longer confirming a driver): stop holding. */
export function releaseAccepting(input: {
  acceptingFor: string | null;
  isSubmitting: boolean;
  status: string | undefined;
}): boolean {
  return Boolean(input.acceptingFor) && !input.isSubmitting && input.status !== 'matching';
}

/**
 * The add-money screen round trip. `wentAway` turns true once the rider blurs
 * the screen; `release` is true when focus comes back after that.
 */
export function addMoneyStep(input: {
  addMoneyFor: string | null;
  wentAway: boolean;
  isFocused: boolean;
}): { wentAway: boolean; release: boolean } {
  if (!input.addMoneyFor) return { wentAway: input.wentAway, release: false };
  if (!input.isFocused) return { wentAway: true, release: false };
  return input.wentAway ? { wentAway: false, release: true } : { wentAway: false, release: false };
}
