import { DRIVER_NEWS_PUSH_TYPES } from './driver-push-quiet';

/**
 * A tapped push -> the screen it is about. One place for every route, driver
 * and rider; the side effects are passed in so this stays testable.
 */
export type PushRouteDeps = {
  isDriverApp: boolean;
  navigate: (href: string) => void;
  requestOpenTripChat: (rideId: string) => boolean;
  requestCurrentCall: (rideId: string) => void;
  liveCallSupported: boolean;
  /** Driver: put this request's card on top of the Active tab. */
  focusDriverOffer: (rideId: string) => void;
};

/* ── rider ride news: the ride's own screen ───────────────────────────────
 * The probe is registered by a component inside the ride session (it knows
 * the live ride and the screen showing). Without one, Home restores it. */
export const RIDER_RIDE_PUSH_TYPES = [
  'ride:offer',
  'ride:scheduled_started',
  'ride:bid_timeout',
  'ride:driver_arrived',
  'ride:driver_cancelled',
];

export type RiderRideView = { rideId?: string; status?: string; itinerary: string; offerNgn?: number };
export type RiderPushProbe = () => {
  ride: RiderRideView | null;
  pathname: string;
  /** Signed out: a waiting tap is dropped, never navigated. */
  signedIn?: boolean;
  /** Go to the screen, popping back to it when it is already in the stack (no second copy on top). */
  go?: (href: string) => void;
};

let riderProbe: RiderPushProbe | null = null;
export function setRiderPushProbe(probe: RiderPushProbe | null): void {
  riderProbe = probe;
}

/** A ride the rider screen already reopened on its own (Home does it once for a restored ride): the push must not open it twice. */
export const reopenedRideIds = new Set<string>();

/** How long a tap waits for a ride that has not loaded yet (cold start: it comes back from the server). */
export const riderPushWait = { totalMs: 5000, everyMs: 250 };

const SEARCHING = ['requesting', 'bidding', 'matching'];
const ON = ['matched', 'active'];
const ENDED = ['completed', 'cancelled'];
const PAYMENT_PATHS = ['/rider-add-money', '/rider-withdraw', '/wallet'];

export function matchingHref(ride: RiderRideView): string {
  const query = `itinerary=${encodeURIComponent(ride.itinerary)}`;
  return typeof ride.offerNgn === 'number' ? `/matching?${query}&offer=${encodeURIComponent(String(ride.offerNgn))}` : `/matching?${query}`;
}

/* ── getting to the screen without a second copy and without losing its params ── */

/** The names of the routes in the stack that holds the rider's screens, bottom first. */
export function stackNamesFrom(state: unknown): string[] {
  type Nav = { routes?: { name: string; state?: unknown }[]; index?: number };
  let level = state as Nav | undefined;
  const first = level?.routes?.map((route) => route.name) ?? [];
  while (level?.routes) {
    const names = level.routes.map((route) => route.name);
    if (names.includes('matching') || names.includes('rider')) return names;
    level = level.routes[level.index ?? level.routes.length - 1]?.state as Nav | undefined;
  }
  return first;
}

export type StackAction =
  | { kind: 'none' }
  | { kind: 'pop'; count: number; thenNavigate?: boolean }
  | { kind: 'push' };

/**
 * How to reach a screen: already in the stack below the top: pop back to it
 * (its params stay; navigating to it would replace them); on top: nothing
 * (or the tab switch, for the trip tab); not there: push it, so what the
 * rider was on stays underneath.
 */
export function stackActionFor(names: string[], href: string): StackAction {
  const path = href.split('?')[0];
  const name = path === '/matching' ? 'matching' : path === '/rider' || path.startsWith('/rider/') ? 'rider' : null;
  if (!name) return { kind: 'push' };
  const at = names.lastIndexOf(name);
  if (at < 0) return { kind: 'push' };
  const tab = name === 'rider' && path !== '/rider';
  if (at === names.length - 1) return tab ? { kind: 'push' } : { kind: 'none' };
  return { kind: 'pop', count: names.length - 1 - at, ...(tab ? { thenNavigate: true } : {}) };
}

/** After the pop: jump to the trip tab only while `rider` is on top of the stack (a slow phone must not get a second one pushed). */
export function riderOnTop(names: string[]): boolean {
  return names[names.length - 1] === 'rider';
}

/** The screen for this push: an href, 'stay' (already there), 'wait' (ride not loaded), or Home. */
export function riderPushTarget(
  type: string,
  rideId: string | undefined,
  state: { ride: RiderRideView | null; pathname: string },
): string {
  const { ride, pathname } = state;
  // A push never closes a payment or top-up screen.
  if (PAYMENT_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) return 'stay';
  if (!ride) return 'wait';
  if (rideId && ride.rideId && ride.rideId !== rideId) {
    if (ENDED.includes(ride.status ?? '')) return 'wait';
    // Another ride is live and its screen is showing: stay on it.
    return pathname === '/matching' || pathname.startsWith('/rider/active-trip') ? 'stay' : '/rider';
  }
  const status = ride.status ?? '';
  const onTrip = ON.includes(status);
  const searching = SEARCHING.includes(status);
  const offerNews = type === 'ride:offer' || type === 'ride:scheduled_started';
  if ((offerNews || type === 'ride:bid_timeout') && searching) {
    return pathname === '/matching' ? 'stay' : matchingHref(ride);
  }
  if ((offerNews || type === 'ride:driver_arrived' || type === 'ride:driver_cancelled') && onTrip) {
    return pathname.startsWith('/rider/active-trip') ? 'stay' : '/rider/active-trip';
  }
  return '/rider';
}

/** The ride whose screen a parked tap will open, so Home does not open it again if (and only if) the parked tap is really taken. */
let parkedRide: { href: string; rideId: string } | null = null;

/** The splash (or the failsafe) navigated to what was parked: Home must not reopen that ride too. */
export function notePushOpened(href: string | null | undefined): void {
  if (href && parkedRide && parkedRide.href === href) reopenedRideIds.add(parkedRide.rideId);
  parkedRide = null;
}

async function routeRiderRide(type: string, rideId: string | undefined, navigate: (href: string) => void): Promise<void> {
  if (!riderProbe) {
    navigate('/rider');
    return;
  }
  const deadline = Date.now() + riderPushWait.totalMs;
  for (;;) {
    // Probe cleared (the rider app went away) or signed out: never navigate.
    const probe = riderProbe;
    if (!probe) return;
    const state = probe();
    if (state.signedIn === false) return;
    const target = riderPushTarget(type, rideId, state);
    if (target === 'wait' && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, riderPushWait.everyMs));
      continue;
    }
    if (target === 'stay') return;
    const href = target === 'wait' ? '/rider' : target;
    const liveId = state.ride?.rideId;
    if (held) {
      // Parked for the splash; marked as opened only when the splash takes it.
      navigate(href);
      parkedRide = href !== '/rider' && liveId ? { href, rideId: liveId } : null;
      return;
    }
    if (href !== '/rider' && liveId) reopenedRideIds.add(liveId);
    // Home is plain navigate, as before: it never pops the rider out of what they are doing.
    (href === '/rider' ? navigate : (state.go ?? navigate))(href);
    return;
  }
}

export function routePush(data: Record<string, unknown> | undefined, deps: PushRouteDeps): void {
  const { isDriverApp, navigate } = deps;
  // The verification decision: that screen says what to fix, or moves an approved driver on.
  if (isDriverApp && (data?.type === 'kyc_rejected' || data?.type === 'kyc_approved')) {
    navigate('/driver/onboarding/pending');
    return;
  }
  // A new request: the Active tab with that request's card on top; if the
  // ride is already gone, the tab alone.
  if (isDriverApp && data?.type === 'ride:request') {
    if (typeof data.rideId === 'string') deps.focusDriverOffer(data.rideId);
    navigate('/driver/(tabs)/active');
    return;
  }
  if (isDriverApp && data?.type === 'dispatch_nudge') {
    const offerWaiting = data.online === '1' && typeof data.rideId === 'string';
    navigate(offerWaiting ? '/driver/(tabs)/active' : '/driver/(tabs)/home');
  }
  // Driver ride news: Active, where the request, bid or trip is; money: Wallet.
  if (isDriverApp && typeof data?.type === 'string' && DRIVER_NEWS_PUSH_TYPES.includes(data.type)) {
    navigate(data.type === 'wallet:updated' ? '/driver/(tabs)/wallet' : '/driver/(tabs)/active');
    return;
  }
  // A rider's ride news opens that ride's own screen, wherever the rider is.
  if (!isDriverApp && typeof data?.type === 'string' && RIDER_RIDE_PUSH_TYPES.includes(data.type)) {
    void routeRiderRide(data.type, typeof data.rideId === 'string' ? data.rideId : undefined, navigate);
    return;
  }
  // Booked ("Driver found!"), possibly by auto-accept while the app was
  // away: the trip screen.
  if (!isDriverApp && data?.type === 'ride:matched') {
    navigate('/rider/active-trip');
    return;
  }
  // Someone is calling: ask for the call on that trip; the call screen opens over whatever is showing.
  if (data?.type === 'call:incoming' && typeof data.rideId === 'string' && deps.liveCallSupported) {
    deps.requestCurrentCall(data.rideId);
    return;
  }
  // A chat message or a missed call: open that trip's chat. If no trip
  // screen is showing, go to the trip; the chat opens when it appears.
  if ((data?.type === 'chat:message' || data?.type === 'call:missed') && typeof data.rideId === 'string') {
    if (!deps.requestOpenTripChat(data.rideId)) {
      navigate(isDriverApp ? '/driver/(tabs)/active' : '/rider/active-trip');
    }
  }
}

/* ── never navigate while the splash is deciding where to go ──────────────
 * A cold-start tap arrives before the splash's own replace(); it would be
 * overridden. Until the splash lets go, the destination is parked and the
 * splash takes it after its replace. */
let held = true;
let parkedHref: string | null = null;

/** Set by the root layout: where a parked tap goes when the failsafe (not the splash) lets go. */
let fallbackNavigate: ((href: string) => void) | null = null;
export function setPushFallbackNavigator(fn: ((href: string) => void) | null): void {
  fallbackNavigate = fn;
}

/** Failsafe: the splash never ran (a deep link, a fast refresh), so nothing else would let go. */
export function releasePushHoldAndNavigate(): void {
  const parked = releasePushHold();
  if (parked && fallbackNavigate) {
    notePushOpened(parked);
    try { fallbackNavigate(parked); } catch { /* stays where it is */ }
  }
}

let holdTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Hold taps again, from now: called when the splash mounts, i.e. at every cold
 * start of the UI. On Android the JS process can outlive a swipe from Recents
 * (the location service keeps it alive), so arming once per process is not enough.
 * Second net: whatever happens, taps are held for 15 s at most.
 */
export function armPushHold(): boolean {
  // Only a released -> held change starts clean: arming while already held keeps a tap parked meanwhile.
  if (!held) {
    parkedHref = null;
    parkedRide = null;
  }
  held = true;
  if (holdTimer) clearTimeout(holdTimer);
  holdTimer = setTimeout(() => { if (held) releasePushHoldAndNavigate(); }, 15000);
  (holdTimer as unknown as { unref?: () => void }).unref?.();
  return true;
}
armPushHold();

/** The splash is done deciding: routes go straight to the router from now on. Returns what was parked. */
export function releasePushHold(): string | null {
  held = false;
  if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
  const parked = parkedHref;
  parkedHref = null;
  return parked;
}

/** Test hook: back to the state at app start. */
export function resetPushRoutingForTests(): void {
  held = false;
  armPushHold();
  parkedHref = null;
  parkedRide = null;
  handled.clear();
  pendingFocus = null;
}

const handled = new Set<string>();
export type TapResponse = {
  notification: { request: { identifier?: string; content: { data?: unknown } } };
};

/**
 * One tap, from the live listener or the launch read. The same notification
 * is acted on once. Marked handled only after it was applied or parked.
 * Returns true when it was acted on.
 */
export function handleTapResponse(
  response: TapResponse,
  deps: PushRouteDeps,
  opts: { launch?: boolean } = {},
): boolean {
  const id = response?.notification?.request?.identifier;
  if (id && handled.has(id)) return false;
  // The tap that launched the app is read while the splash still holds. After the
  // hold is gone, a launch read is a tap from earlier (e.g. made while signed out): not replayed.
  if (opts.launch && !held) {
    if (id) handled.add(id);
    return false;
  }
  const data = response.notification.request.content.data as Record<string, unknown> | undefined;
  routePush(data, {
    ...deps,
    navigate: (href) => {
      if (held) parkedHref = href;
      else deps.navigate(href);
    },
  });
  if (id) handled.add(id);
  return true;
}

/* ── "show this request first": from a tapped push to the Active tab's feed ── */
let pendingFocus: string | null = null;
const focusListeners = new Set<(rideId: string) => void>();

export function clearOfferFocus(): void {
  pendingFocus = null;
}

export function focusDriverOffer(rideId: string): void {
  pendingFocus = rideId;
  focusListeners.forEach((listener) => listener(rideId));
}

/** Takes the waiting request (a launch tap lands before the feed mounts) and subscribes to new ones. */
export function subscribeOfferFocus(listener: (rideId: string) => void): () => void {
  if (pendingFocus) listener(pendingFocus);
  focusListeners.add(listener);
  return () => { focusListeners.delete(listener); };
}
