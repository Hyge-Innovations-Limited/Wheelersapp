/**
 * Auto-accept on a search: the rider switches it on and the server books the
 * first driver at or under their price (and close by), paying from the
 * wallet. Pure, so the session and the tests read the same rules.
 *
 * Old servers know nothing of it: the switch only shows once the server has
 * shown it does (a search status, an autoAccept field, an answer to the switch).
 */

type AutoAcceptFields = {
  rideId: string;
  autoAccept?: boolean;
  /** The server answers auto-accept for this search; the switch shows. */
  autoAcceptSupported?: boolean;
};

export type AutoAcceptReply<T> = { ride: T | null; error: string | null; answered: boolean };

/** What the rider reads when the server turns auto-accept off or down. Short. */
export function autoAcceptRefusalText(reason: string | undefined, message: string | undefined): string {
  if (reason === 'insufficient_funds') return message ?? 'Auto-accept is off. Your wallet is short.';
  if (reason === 'not_searching') return message ?? 'This search has ended.';
  return message ?? 'Auto-accept is off.';
}

/**
 * Apply `ride:auto_accept:done` / `ride:auto_accept:rejected` for the ride on
 * screen. `answered` says the reply was for this ride (the wait can stop).
 */
export function applyAutoAcceptReply<T extends AutoAcceptFields>(
  ride: T | null,
  type: string,
  payload: Record<string, unknown>,
): AutoAcceptReply<T> {
  if (!ride || payload.rideId !== ride.rideId) return { ride, error: null, answered: false };
  const reason = typeof payload.reason === 'string' ? payload.reason : undefined;
  const message = typeof payload.message === 'string' && payload.message.trim() ? payload.message : undefined;
  if (type === 'ride:auto_accept:done') {
    const on = payload.on === true;
    return {
      ride: { ...ride, autoAccept: on, autoAcceptSupported: true },
      // Turned off by the server because the price went past the wallet: the
      // rider is told. Off because it booked a driver ('booked'): nothing to say.
      error: !on && reason === 'insufficient_funds' ? autoAcceptRefusalText(reason, message) : null,
      answered: true,
    };
  }
  if (type === 'ride:auto_accept:rejected') {
    return {
      ride: { ...ride, autoAccept: false, autoAcceptSupported: true },
      error: autoAcceptRefusalText(reason, message),
      answered: true,
    };
  }
  return { ride, error: null, answered: false };
}

/** A field on the search (ride:request:accepted, newer servers): its state, and that the server knows it. */
export function autoAcceptFromPayload<T extends AutoAcceptFields>(ride: T, payload: Record<string, unknown>): T {
  if (typeof payload.autoAccept !== 'boolean') return ride;
  return { ...ride, autoAccept: payload.autoAccept, autoAcceptSupported: true };
}
