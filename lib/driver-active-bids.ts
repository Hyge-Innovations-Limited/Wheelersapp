import type { Href } from 'expo-router';

/** Where a driver's sent offers wait for the rider. */
export const ACTIVE_BIDS_HREF = '/driver/(tabs)/active' as Href;

type LeavingRouter = {
  dismissTo: (href: Href) => void;
  replace: (href: Href) => void;
};

/**
 * The offer is sent: off the request screen and onto the Active tab, where it waits.
 * One pop back to the tabs that also switches to Active (no second tabs screen on the
 * stack). A booking that lands later is moved onto the trip by DriverTripRouter.
 */
export function leaveToActiveBids(router: LeavingRouter): void {
  try {
    router.dismissTo(ACTIVE_BIDS_HREF);
  } catch {
    try {
      router.replace(ACTIVE_BIDS_HREF);
    } catch {
      /* stay: the offer is sent either way */
    }
  }
}
