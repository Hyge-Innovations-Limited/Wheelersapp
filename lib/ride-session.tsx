import { AppState } from 'react-native';
import { isPaySheetError } from '@/lib/pay-sheet-signal';
import * as Crypto from 'expo-crypto';
import {
  applyRiderCounter,
  dismissOffer as dismissOfferFrom,
  mergeOffer,
  offersAfterRefusedAccept,
  offersAfterServerList,
  type OfferEvent,
  stillOpenForChosen,
  withOfferPrice,
  type RideOffer,
} from '@/lib/ride-offers';
import { useAuth } from '@/lib/auth';
import { useAppLocation } from '@/lib/location';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  getBackendWebSocketUrl,
  isBackendConfigured,
  parseRideEstimateWaypoint,
  parseRideRouteGeometry,
  parseRideRouteSnapshot,
  type RideEstimateWaypoint,
  type RideRouteSnapshot,
  getRiderActiveRide,
} from '@/lib/api';
import { resolvePlaceQuery } from '@/lib/google-places';
import { isCurrentLocationLabel, serializeRideItinerary, type RideItinerary } from '@/lib/ride-route';
import { invalidateWalletCache } from '@/lib/wallet-overview';
import { emitCallEvent, isCallMessage } from '@/lib/live-call/events';
import { isDriverApp } from '@/lib/app-variant';
import { carryDriver, reconcileSearch, restoredRideFrom, serverAnswerFrom } from '@/lib/rider-active-ride';
import { createReconnectBackoff } from '@/lib/reconnect-backoff';
import { applySearchStatus } from '@/lib/ride-search-status';
import {
  ROUTE_NOT_PRICED,
  routeQuoteAnswerFrom,
  routeQuoteFrom,
  type RouteQuoteAnswer,
  type RouteUpdateResult,
} from '@/lib/route-quote';
import { DRIVER_LEFT_SEARCHING_AGAIN, isSearchingAgain, rideAfterBidTimeout, rideAfterCancelled } from '@/lib/ride-cancelled';
import { isForRide, rideAfterMatched } from '@/lib/ride-matched';
import {
  acceptRefusalText,
  agreedPriceFor,
  canAcceptOffers,
  CONFIRM_STILL_OPEN_LIMIT,
  droppedOnRefusal,
  refusalIsForConfirming,
} from '@/lib/ride-pay';
import { applyAutoAcceptReply, autoAcceptFromPayload } from '@/lib/auto-accept';

type RideConnectionState = 'disconnected' | 'connecting' | 'connected';
type RideStatus =
  | 'idle'
  | 'requesting'
  /** Published to drivers; their counter-offers are arriving. */
  | 'bidding'
  | 'matching'
  | 'matched'
  | 'active'
  | 'completed'
  | 'cancelled';

type RideDriver = {
  driverId: string;
  /** The driver's *user* id — what a rating is addressed to. */
  driverUserId?: string;
  driverName?: string;
  driverRating?: number;
  vehiclePlate?: string;
  vehicleModel?: string;
  etaSeconds?: number;
  lockedFareNgn?: number;
  driverPhone?: string;
};

type RideDriverLocation = {
  lat: number;
  lng: number;
  distanceToNextStopKm?: number;
  nextStopAddress?: string;
  nextStopOrder?: number;
  remainingStopCount?: number;
  totalDistanceKm?: number;
  isStale?: boolean;
};

/**
 * One driver's bid on this ride.
 *
 * Drivers counter the rider's posted fare rather than accepting it blindly, so
 * a ride can hold several competing offers at once. Keyed by driverId — a
 * driver who re-bids replaces their previous number instead of appearing twice.
 */
export type { RideOffer };

export type RiderRideState = {
  rideId: string;
  status: RideStatus;
  /** The 4 digits to give the driver at pickup; they cannot start the trip without them. */
  tripCode?: string;
  itinerary: RideItinerary;
  fareEstimateNgn?: number;
  plannedDistanceKm?: number;
  plannedDurationSeconds?: number;
  route?: RideRouteSnapshot;
  driver?: RideDriver;
  driverLocation?: RideDriverLocation;
  /** Live driver bids, cheapest first. */
  offers?: RideOffer[];
  /** What the rider is currently offering. */
  riderOfferNgn?: number;
  minOfferNgn?: number;
  suggestedFareNgn?: number;
  /** When the bidding window closes; drivers stop being offered the ride. */
  bidsCloseAt?: string;
  /** How many drivers the request went to (ride:search_status, newer servers). */
  driversNotified?: number | null;
  /** Auto-accept is on for this search: the server books the first driver at or under the price. */
  autoAccept?: boolean;
  /** The server books by itself (newer servers). */
  autoAcceptSupported?: boolean;
  /** The rider said yes to "Auto-book a driver at ₦X?" for this search. */
  autoAcceptChosen?: boolean;
  /** Set when the window closed with nobody accepting. */
  bidTimeout?: boolean;
  startedAt?: string;
  completedAt?: string;
  completedFareNgn?: number;
  cancelReason?: string;
  cancelStage?: string;
  /** Brought back from the server after the app was closed, not started in this run. */
  restored?: boolean;
};

export type RideChatMessage = {
  id: string;
  rideId: string;
  senderId: string;
  senderRole: 'RIDER' | 'DRIVER';
  content: string;
  /** "call": "Missed call", "Call · 3:12", written by the server. */
  kind?: 'text' | 'call';
  createdAt: string;
};

type RideSessionContextValue = {
  isConfigured: boolean;
  connectionState: RideConnectionState;
  currentRide: RiderRideState | null;
  chatMessages: RideChatMessage[];
  error: string | null;
  requestRide: (itinerary: RideItinerary, options?: { offerNgn?: number; autoAccept?: boolean }) => Promise<void>;
  /** Take a driver's bid — this is what actually books the ride. */
  acceptOffer: (driverId: string, shownNgn?: number) => Promise<void>;
  /** Counter a specific driver with a different price. */
  counterOffer: (driverId: string, amountNgn: number) => Promise<void>;
  /** Move the rider's own price and re-offer the trip to every driver. */
  updateOffer: (amountNgn: number) => Promise<void>;
  /** Decline a driver's bid: off the list, and they are told; they can still re-bid. */
  dismissOffer: (driverId: string) => void;
  /** The rider's answer to auto-booking for the search on screen (and the price it was for), told to the server. */
  setAutoBook: (on: boolean, priceNgn?: number) => Promise<void>;
  /**
   * Change where the booked trip goes. With `acceptedFareNgn` (the fare the
   * rider said yes to), it goes ahead only at that price: a newer one comes
   * back as 'price_changed' to be asked about again.
   */
  updateRideRoute: (itinerary: RideItinerary, acceptedFareNgn?: number) => Promise<RouteUpdateResult>;
  /** What the route change would cost before it is made; null from a server that does not quote (behave as before). */
  quoteRideRoute: (itinerary: RideItinerary) => Promise<RouteQuoteAnswer>;
  cancelRide: (reason?: string) => Promise<void>;
  /** Rate the driver of the ride that just finished. */
  submitRating: (input: { rating: number; comment?: string }) => Promise<void>;
  sendChatMessage: (rideId: string, content: string) => Promise<void>;
  /** One Live call message (call:start, call:signal…) on this session's socket. */
  sendCallMessage: (type: string, payload: Record<string, unknown>) => Promise<void>;
  clearRide: () => void;
  /** The pay sheet opened or closed for one driver. Fire and forget; never throws, never shows anything. */
  notifyPaySheet: (driverId: string, open: boolean) => void;
};

type GatewayMessage = {
  type?: string;
  payload?: Record<string, unknown>;
};

type ResolvedRoute = {
  pickup: { lat: number; lng: number; address: string };
  destination: { lat: number; lng: number; address: string };
  stops: Array<{ lat: number; lng: number; address: string }>;
};

const accessTokenRetryAttempts = 6;
const accessTokenRetryDelayMs = 250;

function buildRideSessionConnectionError(wsBaseUrl: string): Error {
  return new Error(
    [
      'Could not connect to the live ride session.',
      `WebSocket URL: ${wsBaseUrl}.`,
      'Check that the API gateway is running, reachable from this device, and accepting /ws connections.',
    ].join(' '),
  );
}

const defaultContext: RideSessionContextValue = {
  isConfigured: false,
  connectionState: 'disconnected',
  currentRide: null,
  chatMessages: [],
  error: null,
  requestRide: async () => {
    throw new Error('Ride session is unavailable.');
  },
  acceptOffer: async () => {
    throw new Error('Ride session is unavailable.');
  },
  counterOffer: async () => {
    throw new Error('Ride session is unavailable.');
  },
  updateOffer: async () => {
    throw new Error('Ride session is unavailable.');
  },
  dismissOffer: () => undefined,
  setAutoBook: async () => undefined,
  updateRideRoute: async () => {
    throw new Error('Ride session is unavailable.');
  },
  quoteRideRoute: async () => {
    throw new Error('Ride session is unavailable.');
  },
  cancelRide: async () => {
    throw new Error('Ride session is unavailable.');
  },
  submitRating: async () => {
    throw new Error('Ride session is unavailable.');
  },
  sendChatMessage: async () => {
    throw new Error('Ride session is unavailable.');
  },
  sendCallMessage: async () => { throw new Error('Not connected.'); },
  clearRide: () => undefined,
  notifyPaySheet: () => undefined,
};

const RideSessionContext = createContext<RideSessionContextValue>(defaultContext);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function getNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function getRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function isTerminalRideStatus(status: RideStatus): boolean {
  return status === 'completed' || status === 'cancelled';
}

function formatCancelStage(ride: RiderRideState):
  | 'before_match'
  | 'after_match'
  | 'driver_en_route'
  | 'active_trip' {
  if (ride.status === 'active') {
    return 'active_trip';
  }

  if (ride.status === 'matched') {
    return 'driver_en_route';
  }

  if (ride.status === 'matching') {
    return 'after_match';
  }

  return 'before_match';
}

function parseRouteStopAddresses(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => getRecord(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .filter((item) => item.type === 'intermediate')
    .sort((left, right) => {
      const leftOrder = getNumber(left.stopOrder) ?? 0;
      const rightOrder = getNumber(right.stopOrder) ?? 0;
      return leftOrder - rightOrder;
    })
    .map((item) => getString(item.address))
    .filter((item): item is string => Boolean(item));
}

function parseWaypointList(value: unknown): RideEstimateWaypoint[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const waypoints = value
    .map((item) => parseRideEstimateWaypoint(item))
    .filter((item): item is RideEstimateWaypoint => item != null);

  return waypoints.length === value.length ? waypoints : null;
}

async function getAccessTokenWithRetry(
  getAccessToken: () => Promise<string | null | undefined>,
): Promise<string | null> {
  for (let attempt = 0; attempt < accessTokenRetryAttempts; attempt += 1) {
    const accessToken = await getAccessToken();
    if (accessToken) {
      return accessToken;
    }

    if (attempt < accessTokenRetryAttempts - 1) {
      await sleep(accessTokenRetryDelayMs);
    }
  }

  return null;
}

/**
 * Turn the itinerary's labels into coordinates.
 *
 * "Current location" is resolved from the device fix, never sent to a
 * geocoder — geocoding that phrase is what pinned every default pickup to one
 * neighbourhood.
 */
async function resolveRideRoute(
  itinerary: RideItinerary,
  deviceLocation?: { lat: number; lng: number; address: string } | null,
): Promise<ResolvedRoute> {
  const wantsDevicePickup = isCurrentLocationLabel(itinerary.pickup);

  if (wantsDevicePickup && !deviceLocation) {
    throw new Error(
      'We could not read your location. Turn on location access, or type your pickup address.',
    );
  }

  const pickup = wantsDevicePickup && deviceLocation
    ? {
        lat: deviceLocation.lat,
        lng: deviceLocation.lng,
        address: deviceLocation.address,
      }
    : await resolvePlaceQuery(itinerary.pickup);
  const stopLabels = itinerary.stops.slice(0, -1);
  const destinationLabel = itinerary.stops[itinerary.stops.length - 1];

  if (!destinationLabel) {
    throw new Error('A destination is required before requesting a ride.');
  }

  const [destination, ...stops] = await Promise.all([
    resolvePlaceQuery(destinationLabel),
    ...stopLabels.map((stop) => resolvePlaceQuery(stop)),
  ]);

  return {
    pickup,
    destination,
    stops,
  };
}

/** A route quote not answered in this long: the server does not quote; the change goes as before. */
const ROUTE_QUOTE_WAIT_MS = 5_000;
/** A priced route change not answered in this long is taken as made (as an unpriced one always was). */
const ROUTE_UPDATE_WAIT_MS = 8_000;

/** How long "Confirming your driver" waits before asking the server where the booking stands. */
const CONFIRM_RESYNC_MS = 20_000;

/** The auto-accept fields a search payload carries (newer servers); nothing from older ones. */
function autoAcceptFieldsFrom(ride: RiderRideState, payload: Record<string, unknown>): Partial<RiderRideState> {
  const next = autoAcceptFromPayload(ride, payload);
  return next === ride ? {} : { autoAccept: next.autoAccept, autoAcceptSupported: next.autoAcceptSupported };
}

export function RideSessionProvider({ children }: { children: ReactNode }) {
  const { getAccessToken, isReady, user } = useAuth();
  const [connectionState, setConnectionState] = useState<RideConnectionState>('disconnected');
  const [currentRide, setCurrentRide] = useState<RiderRideState | null>(null);
  const [chatMessages, setChatMessages] = useState<RideChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const connectPromiseRef = useRef<Promise<WebSocket> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Waits 1s, 2s, 4s ... up to 30s between attempts, each scattered at random.
  const backoffRef = useRef(createReconnectBackoff());
  const shouldMaintainConnectionRef = useRef(false);
  const currentRideRef = useRef<RiderRideState | null>(null);
  // The offers on screen when the rider accepted one. Accepting clears them;
  // if the server refuses (the wallet is short), they are put back.
  const offersBeforeAcceptRef = useRef<RideOffer[] | null>(null);
  const userRef = useRef(user);

  // The device fix, kept in a ref so requestRide reads the newest value without
  // being rebuilt (and re-subscribing the socket) on every GPS update.
  const { currentLocation } = useAppLocation();
  const currentLocationRef = useRef(currentLocation);
  useEffect(() => {
    currentLocationRef.current = currentLocation;
  }, [currentLocation]);

  const restoreActiveRideRef = useRef<(options?: { confirmCheck?: boolean }) => Promise<void>>(async () => undefined);
  const refreshOffersRef = useRef<() => Promise<void>>(async () => undefined);
  /** 20 s checks in a row that found the chosen driver's offer still open on the server. */
  const confirmChecksRef = useRef(0);
  /** The driver whose accept went out and is being confirmed; set the moment it is sent. */
  const confirmingDriverRef = useRef<string | null>(null);
  /** Replies being waited for, by type (and ride); a timeout gives up on each. */
  const replyWaitersRef = useRef<
    {
      types: string[];
      rideId?: string;
      /** Only replies that answer this request (an error tied to it, not any error). */
      matches?: (type: string, payload: Record<string, unknown>) => boolean;
      resolve: (reply: { type: string; payload: Record<string, unknown> } | null) => void;
    }[]
  >([]);
  const waitForReply = useCallback(
    (
      types: string[],
      rideId: string | undefined,
      timeoutMs: number,
      matches?: (type: string, payload: Record<string, unknown>) => boolean,
    ) =>
      new Promise<{ type: string; payload: Record<string, unknown> } | null>((resolve) => {
        const waiter = {
          types,
          rideId,
          matches,
          resolve: (reply: { type: string; payload: Record<string, unknown> } | null) => {
            clearTimeout(timer);
            resolve(reply);
          },
        };
        const timer = setTimeout(() => {
          replyWaitersRef.current = replyWaitersRef.current.filter((item) => item !== waiter);
          resolve(null);
        }, timeoutMs);
        replyWaitersRef.current = [...replyWaitersRef.current, waiter];
      }),
    [],
  );
  /** Offers that came or went on the socket lately, replayed over a server list fetched meanwhile. */
  const offerEventsRef = useRef<OfferEvent[]>([]);
  const noteOfferEvent = useCallback((event: OfferEvent) => {
    const cutoff = event.at - 120_000;
    offerEventsRef.current = [...offerEventsRef.current.filter((item) => item.at >= cutoff), event].slice(-50);
  }, []);
  const offerEventsSince = useCallback(
    (startedAt: number) => offerEventsRef.current.filter((item) => item.at >= startedAt),
    [],
  );

  const setRideState = useCallback(
    (updater: RiderRideState | null | ((previous: RiderRideState | null) => RiderRideState | null)) => {
      setCurrentRide((previous) => {
        const next = typeof updater === 'function' ? updater(previous) : updater;
        currentRideRef.current = next;
        return next;
      });
    },
    [],
  );

  const clearReconnectTimer = useCallback(() => {
    if (!reconnectTimerRef.current) {
      return;
    }

    clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = null;
  }, []);

  const clearRide = useCallback(() => {
    offersBeforeAcceptRef.current = null;
    confirmingDriverRef.current = null;
    confirmChecksRef.current = 0;
    setError(null);
    setRideState(null);
    setChatMessages([]);
  }, [setRideState]);

  const handleGatewayMessage = useCallback(
    (message: GatewayMessage) => {
      const type = getString(message.type);
      const payload = getRecord(message.payload) ?? {};

      if (!type) {
        return;
      }

      // A reply something is waiting for (a route quote, a priced route change).
      let waitedFor = false;
      for (const waiter of [...replyWaitersRef.current]) {
        if (
          waiter.types.includes(type) &&
          (!waiter.rideId || !getString(payload.rideId) || getString(payload.rideId) === waiter.rideId) &&
          (!waiter.matches || waiter.matches(type, payload))
        ) {
          replyWaitersRef.current = replyWaitersRef.current.filter((item) => item !== waiter);
          waiter.resolve({ type, payload });
          waitedFor = true;
        }
      }
      // The quote's own answers, and an error that answered a quote (an older
      // server that does not know it): nothing else is done with them.
      if (type === 'ride:route:quote:result' || type === 'ride:route:update:rejected') return;
      if (type === 'error' && waitedFor) return;
      // The pay-sheet message's own replies: the rider sees nothing, nothing retries.
      if (type === 'ride:pay_sheet:ok' || isPaySheetError(type, payload)) return;

      // Anything about a Live call goes to the call screen, and only there. In
      // the driver app the driver session's socket carries calls; a message
      // arriving here too would be handled twice.
      if (isCallMessage(type, payload)) {
        if (!isDriverApp) emitCallEvent(type, payload);
        return;
      }

      if (type === 'error') {
        setError(getString(payload.message) ?? 'Ride session error.');
        const heldOffers = offersBeforeAcceptRef.current;
        if (heldOffers) {
          offersBeforeAcceptRef.current = null;
          confirmingDriverRef.current = null;
          setRideState((previous) =>
            previous && previous.status === 'matching'
              ? {
                  ...previous,
                  status: 'bidding',
                  offers: offersAfterRefusedAccept(heldOffers, previous.offers),
                  driver: undefined,
                }
              : previous,
          );
        }
        return;
      }

      if (type === 'ride:request:accepted') {
        setError(null);
        setRideState((previous) => {
          if (!previous) {
            return previous;
          }

          return {
            ...previous,
            // The request is live and drivers can now bid on it. Calling this
            // "matching" hid the fact that the rider has a decision to make.
            status: 'bidding',
            route: parseRideRouteSnapshot(payload) ?? previous.route,
            plannedDistanceKm:
              getNumber(payload.plannedDistanceKm) ?? previous.plannedDistanceKm,
            plannedDurationSeconds:
              getNumber(payload.plannedDurationSeconds) ?? previous.plannedDurationSeconds,
            fareEstimateNgn: getNumber(payload.fareEstimateNgn) ?? previous.fareEstimateNgn,
            riderOfferNgn: getNumber(payload.riderOfferNgn) ?? previous.riderOfferNgn,
            minOfferNgn: getNumber(payload.minOfferNgn) ?? previous.minOfferNgn,
            suggestedFareNgn:
              getNumber(payload.suggestedFareNgn) ?? previous.suggestedFareNgn,
            bidsCloseAt: getString(payload.bidsCloseAt) ?? previous.bidsCloseAt,
            offers: previous.offers ?? [],
            ...autoAcceptFieldsFrom(previous, payload),
          };
        });
        return;
      }

      // ── A driver has bid on this ride ───────────────────────────────────
      if (type === 'ride:counter_offer') {
        const driverId = getString(payload.driverId);
        const counterOfferNgn = getNumber(payload.counterOfferNgn);
        if (!driverId || counterOfferNgn === undefined) {
          return;
        }

        // An offer on a search this app did not start (a ride booked for
        // later whose search has just begun): fetch that search from the
        // server, offers and all, instead of dropping the offer on the floor.
        if (!currentRideRef.current) {
          void restoreActiveRideRef.current();
          return;
        }

        const offer: RideOffer = {
          driverId,
          driverUserId: getString(payload.driverUserId) ?? '',
          counterOfferNgn,
          driverName: getString(payload.driverName) ?? 'Driver',
          driverRating: getNumber(payload.driverRating) ?? 0,
          vehiclePlate: getString(payload.vehiclePlate) ?? '',
          vehicleModel: getString(payload.vehicleModel) ?? '',
          etaSeconds: getNumber(payload.etaSeconds) ?? 0,
          distanceKm: getNumber(payload.distanceKm),
          receivedAt: new Date().toISOString(),
        };
        if (isForRide(currentRideRef.current, payload)) noteOfferEvent({ at: Date.now(), kind: 'add', offer });

        setRideState((previous) => {
          if (!previous) {
            return previous;
          }

          const offers = mergeOffer(previous.offers ?? [], offer);

          return {
            ...previous,
            status: previous.status === 'requesting' ? 'bidding' : previous.status,
            bidTimeout: false,
            offers,
          };
        });
        return;
      }

      // A new price for every driver restarts the search's clock: the server
      // says when it now closes.
      if (type === 'ride:rider_counter_offer:accepted') {
        const bidsCloseAt = getString(payload.bidsCloseAt);
        if (bidsCloseAt) {
          setRideState((previous) => (previous ? { ...previous, bidsCloseAt } : previous));
        }
        return;
      }

      // Newer servers: how many drivers saw the price, and when the search closes.
      if (type === 'ride:search_status') {
        // A server that sends this books by itself (auto-accept): the line saying so shows.
        setRideState((previous) => {
          const next = applySearchStatus(previous, payload);
          return next && payload.rideId === next.rideId && !next.autoAcceptSupported
            ? { ...next, autoAcceptSupported: true }
            : next;
        });
        return;
      }

      if (type === 'ride:auto_accept:done' || type === 'ride:auto_accept:rejected') {
        // Auto-accept is automatic now (the server books the first driver at
        // or under the price when the wallet covers it); the app sends no
        // switch. A reply that still arrives is only noted, never shown.
        setRideState((previous) => applyAutoAcceptReply(previous, type, payload).ride);
        return;
      }

      // The rider's own counter reached the driver; show it as pending.
      if (type === 'ride:rider_counter_offer:confirmed') {
        const driverId = getString(payload.driverId);
        const amount = getNumber(payload.counterOfferNgn);
        if (!driverId || amount === undefined) {
          return;
        }

        setRideState((previous) =>
          previous
            ? {
                ...previous,
                offers: applyRiderCounter(previous.offers ?? [], driverId, amount),
              }
            : previous,
        );
        return;
      }

      // Nobody accepted before the window closed.
      if (type === 'ride:bid_timeout') {
        const ended = rideAfterBidTimeout(currentRideRef.current, payload);
        if (ended && ended !== currentRideRef.current) {
          offersBeforeAcceptRef.current = null;
          confirmingDriverRef.current = null;
          confirmChecksRef.current = 0;
        }
        setRideState((previous) => rideAfterBidTimeout(previous, payload));
        return;
      }

      if (type === 'ride:matched') {
        // Booked while the app had no ride (or after a restart): the server has it.
        if (!currentRideRef.current) {
          void restoreActiveRideRef.current();
          return;
        }
        // Another ride's booking is not this one's.
        if (!isForRide(currentRideRef.current, payload)) return;
        offersBeforeAcceptRef.current = null;
        confirmingDriverRef.current = null;
        confirmChecksRef.current = 0;
        setError(null);
        setRideState((previous) => rideAfterMatched(previous, payload));
        return;
      }

      if (type === 'ride:route:updated') {
        setError(null);
        setRideState((previous) => {
          if (!previous) {
            return previous;
          }

          const destination = getRecord(payload.destination);
          const destinationAddress = getString(destination?.address);
          const stopAddresses = parseRouteStopAddresses(payload.stops);
          const pickup =
            parseRideEstimateWaypoint(payload.pickup) ?? previous.route?.pickup;
          const updatedDestination =
            parseRideEstimateWaypoint(payload.destination) ?? previous.route?.destination;
          const updatedStops = parseWaypointList(payload.stops) ?? previous.route?.stops;
          const updatedRoute = parseRideRouteGeometry(payload.route);

          return {
            ...previous,
            itinerary: destinationAddress
              ? {
                  pickup: previous.itinerary.pickup,
                  stops: [...stopAddresses, destinationAddress],
                }
              : previous.itinerary,
            plannedDistanceKm:
              getNumber(payload.plannedDistanceKm) ?? previous.plannedDistanceKm,
            plannedDurationSeconds:
              getNumber(payload.plannedDurationSeconds) ?? previous.plannedDurationSeconds,
            fareEstimateNgn: getNumber(payload.fareEstimateNgn) ?? previous.fareEstimateNgn,
            route:
              pickup && updatedDestination && updatedStops && updatedRoute
                ? {
                    pickup,
                    destination: updatedDestination,
                    stops: updatedStops,
                    route: updatedRoute,
                  }
                : previous.route,
          };
        });
        return;
      }

      if (type === 'ride:driver_location') {
        setRideState((previous) => {
          if (!previous) {
            return previous;
          }

          return {
            ...previous,
            driverLocation: {
              lat: getNumber(payload.lat) ?? previous.driverLocation?.lat ?? 0,
              lng: getNumber(payload.lng) ?? previous.driverLocation?.lng ?? 0,
              distanceToNextStopKm:
                getNumber(payload.distanceToNextStopKm) ??
                previous.driverLocation?.distanceToNextStopKm,
              nextStopAddress:
                getString(payload.nextStopAddress) ?? previous.driverLocation?.nextStopAddress,
              nextStopOrder:
                getNumber(payload.nextStopOrder) ?? previous.driverLocation?.nextStopOrder,
              remainingStopCount:
                getNumber(payload.remainingStopCount) ??
                previous.driverLocation?.remainingStopCount,
              totalDistanceKm:
                getNumber(payload.totalDistanceKm) ?? previous.driverLocation?.totalDistanceKm,
              isStale:
                typeof payload.isStale === 'boolean'
                  ? payload.isStale
                  : previous.driverLocation?.isStale,
            },
          };
        });
        return;
      }

      if (type === 'ride:started') {
        setError(null);
        setRideState((previous) => {
          if (!previous) {
            return previous;
          }

          return {
            ...previous,
            status: 'active',
            startedAt: getString(payload.startedAt) ?? previous.startedAt,
          };
        });
        return;
      }

      if (type === 'ride:completed') {
        setError(null);
        setRideState((previous) => {
          if (!previous) {
            return previous;
          }

          return {
            ...previous,
            status: 'completed',
            completedAt: getString(payload.completedAt) ?? previous.completedAt,
            completedFareNgn: getNumber(payload.fareNgn) ?? previous.completedFareNgn,
            plannedDistanceKm:
              getNumber(payload.distanceKm) ?? previous.plannedDistanceKm,
            plannedDurationSeconds:
              getNumber(payload.durationSeconds) ?? previous.plannedDurationSeconds,
          };
        });
        return;
      }

      if (type === 'ride:cancelled') {
        // The booked driver pulled out and the server searches again on the
        // same ride (searchingAgain): back to finding drivers, with a short
        // note, and the released hold shows in the balance. Otherwise it ends.
        const again =
          isSearchingAgain(payload) &&
          isForRide(currentRideRef.current, payload) &&
          rideAfterCancelled(currentRideRef.current, payload)?.status === 'bidding';
        if (isForRide(currentRideRef.current, payload)) {
          offersBeforeAcceptRef.current = null;
          confirmingDriverRef.current = null;
          confirmChecksRef.current = 0;
        }
        if (again) {
          invalidateWalletCache();
          setError(DRIVER_LEFT_SEARCHING_AGAIN);
        }
        setRideState((previous) => rideAfterCancelled(previous, payload));
        return;
      }

      if (type === 'ride:driver_rejected') {
        // The driver withdrew their offer (or went offline): it leaves the list, quietly.
        const rideId = getString(payload.rideId);
        const driverId = getString(payload.driverId);
        if (!driverId) return;
        const sameRide = !rideId || currentRideRef.current?.rideId === rideId;
        if (sameRide) noteOfferEvent({ at: Date.now(), kind: 'remove', driverId });
        // While a driver is being confirmed, the list kept from Accept loses
        // them too: a refused accept must not bring a withdrawn offer back.
        if (sameRide && offersBeforeAcceptRef.current) {
          offersBeforeAcceptRef.current = dismissOfferFrom(offersBeforeAcceptRef.current, driverId);
        }
        setRideState((previous) =>
          previous &&
          (previous.status === 'bidding' || previous.status === 'matching') &&
          (!rideId || previous.rideId === rideId)
            ? { ...previous, offers: dismissOfferFrom(previous.offers ?? [], driverId) }
            : previous,
        );
        return;
      }

      // The server turned the accept down: back to the offers, without a
      // driver who cannot take it. Left alone, "Confirming your driver"
      // waited for a booking that was never made.
      if (type === 'ride:accept_offer:rejected') {
        const reason = getString(payload.reason);
        if (reason === 'already_matched') {
          // Booked another way (twice tapped, or on WhatsApp): the server has the driver.
          void restoreActiveRideRef.current();
          return;
        }
        const driverId = getString(payload.driverId);
        // A late refusal (another ride, an earlier pick, or once Confirming is over) changes nothing.
        if (!isForRide(currentRideRef.current, payload)) return;
        if (!refusalIsForConfirming(confirmingDriverRef.current, driverId)) return;
        const confirmingId = confirmingDriverRef.current;
        const heldOffers = offersBeforeAcceptRef.current;
        offersBeforeAcceptRef.current = null;
        confirmingDriverRef.current = null;
        confirmChecksRef.current = 0;
        setError(acceptRefusalText(reason, getString(payload.message)));
        // The driver's price as the server has it now, when it says (a refused 'offer_changed').
        const priceNow = getNumber(payload.counterOfferNgn) ?? getNumber(payload.currentFareNgn);
        setRideState((previous) => {
          if (!previous || previous.status !== 'matching' || previous.driver?.driverId !== confirmingId) return previous;
          const offers = offersAfterRefusedAccept(heldOffers, previous.offers, droppedOnRefusal(reason, driverId));
          return {
            ...previous,
            status: 'bidding',
            driver: undefined,
            offers: reason === 'offer_changed' ? withOfferPrice(offers, driverId, priceNow) : offers,
          };
        });
        // The offers as the server has them now: the new price on the card, then the rider taps again.
        if (reason === 'offer_changed') void refreshOffersRef.current();
        return;
      }

      if (type === 'chat:message') {
        const messageId = getString(payload.messageId);
        const rideId = getString(payload.rideId);
        const senderId = getString(payload.senderId);
        const senderRole = getString(payload.senderRole) as 'RIDER' | 'DRIVER' | undefined;
        const content = getString(payload.content);
        const createdAt = getString(payload.createdAt);
        if (!messageId || !rideId || !senderId || !senderRole || !content) return;

        const msg: RideChatMessage = {
          id: messageId,
          rideId,
          senderId,
          senderRole,
          content,
          kind: getString(payload.kind) === 'call' ? 'call' : 'text',
          createdAt: createdAt ?? new Date().toISOString(),
        };
        setChatMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
        return;
      }

      if (type === 'group-ride:driver-assigned') {
        setError(null);
        setRideState((previous) => {
          if (!previous) {
            return previous;
          }

          return {
            ...previous,
            status: 'matched',
            driver: {
              driverId: getString(payload.driverId) ?? previous.driver?.driverId ?? '',
              driverUserId:
                getString(payload.driverUserId) ?? previous.driver?.driverUserId,
              driverName: getString(payload.driverName) ?? previous.driver?.driverName,
              driverRating: getNumber(payload.driverRating) ?? previous.driver?.driverRating,
              vehiclePlate: getString(payload.vehiclePlate) ?? previous.driver?.vehiclePlate,
              vehicleModel: getString(payload.vehicleModel) ?? previous.driver?.vehicleModel,
              etaSeconds: getNumber(payload.etaSeconds) ?? previous.driver?.etaSeconds,
              driverPhone: getString(payload.driverPhone) ?? previous.driver?.driverPhone,
            },
          };
        });
        return;
      }

      if (type === 'wallet:updated') {
        invalidateWalletCache();
        return;
      }
    },
    [setRideState, noteOfferEvent],
  );

  const scheduleReconnect = useCallback(() => {
    if (!shouldMaintainConnectionRef.current || !userRef.current || reconnectTimerRef.current) {
      return;
    }

    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      if (!shouldMaintainConnectionRef.current || !userRef.current) {
        return;
      }

      void connect().catch(() => undefined);
    }, backoffRef.current.nextDelayMs());
  }, []);

  const connect = useCallback(async (): Promise<WebSocket> => {
    if (!isBackendConfigured()) {
      throw new Error('Wheelers is not available right now. Please try again later.');
    }

    if (!isReady || !user) {
      throw new Error('Sign in before requesting a ride.');
    }

    const existingSocket = socketRef.current;
    if (existingSocket && existingSocket.readyState === WebSocket.OPEN) {
      return existingSocket;
    }

    if (connectPromiseRef.current) {
      return connectPromiseRef.current;
    }

    const wsBaseUrl = getBackendWebSocketUrl();
    if (!wsBaseUrl) {
      throw new Error('Wheelers is not available right now. Please try again later.');
    }

    setConnectionState('connecting');
    clearReconnectTimer();

    connectPromiseRef.current = (async () => {
      const accessToken = await getAccessTokenWithRetry(getAccessToken);
      if (!accessToken) {
        throw new Error('Could not get an access token for ride updates.');
      }

      const socketUrl = new URL(wsBaseUrl);
      socketUrl.searchParams.set('accessToken', accessToken);
      const connectionError = buildRideSessionConnectionError(wsBaseUrl);

      return await new Promise<WebSocket>((resolve, reject) => {
        const socket = new WebSocket(socketUrl.toString());
        let settled = false;

        socketRef.current = socket;

        socket.onopen = () => {
          settled = true;
          backoffRef.current.opened();
          setConnectionState('connected');
          setError(null);
          resolve(socket);
          // Every (re)connect: pick the trip back up if the app had forgotten it (a restart),
          // with its trip code, which the driver cannot start without.
          void restoreActiveRideRef.current();
        };

        socket.onmessage = (event) => {
          const raw = typeof event.data === 'string' ? event.data : '';
          if (!raw) {
            return;
          }

          try {
            handleGatewayMessage(JSON.parse(raw) as GatewayMessage);
          } catch {
            // Ignore malformed messages — don't surface to UI
          }
        };

        socket.onerror = () => {
          if (settled) {
            return;
          }

          settled = true;
          setConnectionState('disconnected');
          scheduleReconnect();
          reject(connectionError);
        };

        socket.onclose = () => {
          socketRef.current = null;
          setConnectionState('disconnected');
          if (!settled) {
            settled = true;
            scheduleReconnect();
            reject(connectionError);
            return;
          }
          scheduleReconnect();
        };
      });
    })();

    try {
      return await connectPromiseRef.current;
    } finally {
      connectPromiseRef.current = null;
    }
  }, [
    clearReconnectTimer,
    getAccessToken,
    handleGatewayMessage,
    isReady,
    scheduleReconnect,
    user,
  ]);

  const sendEnvelope = useCallback(
    async (type: string, payload: Record<string, unknown>): Promise<void> => {
      const socket = await connect();

      if (socket.readyState !== WebSocket.OPEN) {
        throw new Error('Ride session is not connected yet.');
      }

      socket.send(JSON.stringify({ type, payload }));
    },
    [connect],
  );

  const requestRide = useCallback(
    async (itinerary: RideItinerary, options?: { offerNgn?: number; autoAccept?: boolean }): Promise<void> => {
      if (!isBackendConfigured()) {
        throw new Error('Wheelers is not available right now. Please try again later.');
      }

      const itineraryKey = serializeRideItinerary(itinerary);
      const existingRide = currentRideRef.current;
      if (existingRide && !isTerminalRideStatus(existingRide.status)) {
        const existingKey = serializeRideItinerary(existingRide.itinerary);
        if (existingKey === itineraryKey) {
          return;
        }

        throw new Error('You already have a ride in progress.');
      }

      const rideId = Crypto.randomUUID();

      setError(null);
      const autoAccept = options?.autoAccept === true;
      setRideState({
        rideId,
        status: 'requesting',
        itinerary,
        autoAcceptChosen: autoAccept,
      });

      try {
        const resolvedRoute = await resolveRideRoute(itinerary, currentLocationRef.current);

        await sendEnvelope('ride:request', {
          rideId,
          pickup: resolvedRoute.pickup,
          destination: resolvedRoute.destination,
          stops: resolvedRoute.stops,
          paymentMethod: 'wallet_balance',
          // What the rider is willing to pay. Omitted, the backend falls back
          // to its suggested fare — but then the rider never named a price,
          // which is the whole point of bidding.
          ...(options?.offerNgn !== undefined ? { offerNgn: options.offerNgn } : {}),
          // The rider said yes to "Auto-book a driver at ₦X?" (their wallet
          // covers it). Only then does the server book and hold by itself;
          // older servers ignore it.
          autoAccept,
        });
      } catch (requestError) {
        setRideState(null);
        // Only show non-connection errors (e.g. bad address, missing destination)
        if (requestError instanceof Error && !requestError.message.includes('WebSocket') && !requestError.message.includes('connect')) {
          setError(requestError.message);
        }
      }
    },
    [sendEnvelope, setRideState, user],
  );

  /**
   * What the route change would cost, before it is made (nothing moves).
   * Only a server that says it does not know the quote ('Unknown event type')
   * answers 'unpriced', and the change then goes as it always did. Any other
   * error, or no answer within 5 s: it throws, and nothing is sent.
   */
  const quoteRideRoute = useCallback(
    async (itinerary: RideItinerary): Promise<RouteQuoteAnswer> => {
      const activeRide = currentRideRef.current;
      if (!activeRide?.rideId) {
        throw new Error('There is no live ride route to update yet.');
      }
      const resolvedRoute = await resolveRideRoute(itinerary);
      const rideId = activeRide.rideId;
      const reply = waitForReply(
        ['ride:route:quote:result', 'error'],
        rideId,
        ROUTE_QUOTE_WAIT_MS,
        (type, payload) => routeQuoteAnswerFrom(type, payload, rideId) !== null,
      );
      await sendEnvelope('ride:route:quote', {
        rideId,
        destination: resolvedRoute.destination,
        stops: resolvedRoute.stops,
      });
      const answer = await reply;
      const result = answer ? routeQuoteAnswerFrom(answer.type, answer.payload, rideId) : null;
      if (!result) throw new Error(ROUTE_NOT_PRICED);
      return result;
    },
    [sendEnvelope, waitForReply],
  );

  const updateRideRoute = useCallback(
    async (itinerary: RideItinerary, acceptedFareNgn?: number): Promise<RouteUpdateResult> => {
      const activeRide = currentRideRef.current;
      if (!activeRide?.rideId) {
        throw new Error('There is no live ride route to update yet.');
      }

      const resolvedRoute = await resolveRideRoute(itinerary);
      setError(null);

      // At the price the rider said yes to: the server goes ahead only at it,
      // or answers with the price now.
      const priced = typeof acceptedFareNgn === 'number' && acceptedFareNgn > 0;
      const reply = priced
        ? waitForReply(
            ['ride:route:update:accepted', 'ride:route:updated', 'ride:route:update:rejected'],
            activeRide.rideId,
            ROUTE_UPDATE_WAIT_MS,
          )
        : null;
      await sendEnvelope('ride:route:update', {
        rideId: activeRide.rideId,
        driverId: activeRide.driver?.driverId,
        destination: resolvedRoute.destination,
        stops: resolvedRoute.stops,
        ...(priced ? { acceptedFareNgn: Math.round(acceptedFareNgn) } : {}),
      });
      if (reply) {
        const answer = await reply;
        if (answer?.type === 'ride:route:update:rejected') {
          const quote = routeQuoteFrom(answer.payload);
          if (getString(answer.payload.reason) === 'PRICE_CHANGED' && quote) return { kind: 'price_changed', quote };
          throw new Error(getString(answer.payload.message) ?? 'Could not update the ride route.');
        }
      }

      setRideState((previous) => {
        if (!previous) {
          return previous;
        }

        return {
          ...previous,
          itinerary,
        };
      });
      return { kind: 'done' };
    },
    [sendEnvelope, setRideState, waitForReply],
  );

  /**
   * Take a driver's bid. This is the moment the ride is actually booked: the
   * backend locks the agreed fare against the rider's wallet and tells the
   * driver they won.
   */
  const acceptOffer = useCallback(
    async (driverId: string, shownNgn?: number): Promise<void> => {
      const ride = currentRideRef.current;
      const offer = ride?.offers?.find((item) => item.driverId === driverId);

      if (!ride || !offer) {
        throw new Error('That bid is no longer available.');
      }
      // Only an open search takes an accept: once a driver is booked (or one
      // is being confirmed, or the search ended) a second accept would flip
      // the booked ride back to "Confirming" with another driver.
      if (!canAcceptOffers(ride)) {
        throw new Error('This search is no longer taking offers.');
      }

      // The price the rider saw and said yes to; if the driver has moved it
      // since, the server refuses ('offer_changed') and the new one is shown.
      const agreedFareNgn = agreedPriceFor(offer.counterOfferNgn, shownNgn);
      await sendEnvelope('ride:accept_offer', {
        rideId: ride.rideId,
        driverId: offer.driverId,
        driverUserId: offer.driverUserId,
        agreedFareNgn,
        paymentMethod: 'wallet_balance',
      });
      offersBeforeAcceptRef.current = ride.offers ?? null;
      confirmingDriverRef.current = offer.driverId;
      confirmChecksRef.current = 0;

      // Optimistically leave the auction. `ride:matched` fills in the rest of
      // the driver, but the accepted bid already knows who they are — keeping
      // it means a rating still has somebody to address if that event is
      // missed or the app restarts.
      setRideState((previous) =>
        previous
          ? {
              ...previous,
              status: 'matching',
              offers: [],
              // This driver alone: nothing of a driver shown before carries over.
              driver: {
                driverId: offer.driverId,
                driverUserId: offer.driverUserId,
                driverName: offer.driverName,
                driverRating: offer.driverRating,
                vehiclePlate: offer.vehiclePlate,
                vehicleModel: offer.vehicleModel,
                etaSeconds: offer.etaSeconds,
                lockedFareNgn: agreedFareNgn,
              },
            }
          : previous,
      );
    },
    [sendEnvelope, setRideState],
  );

  /** Counter one driver with a different price; they may re-bid or walk away. */
  const counterOffer = useCallback(
    async (driverId: string, amountNgn: number): Promise<void> => {
      const ride = currentRideRef.current;
      if (!ride) {
        throw new Error('You do not have a ride in progress.');
      }

      if (!Number.isFinite(amountNgn) || amountNgn <= 0) {
        throw new Error('Enter a valid amount.');
      }

      // The backend enforces the floor too, but failing here keeps the rider
      // from watching a bid vanish with no explanation.
      if (ride.minOfferNgn !== undefined && amountNgn < ride.minOfferNgn) {
        throw new Error(
          `The lowest you can offer on this trip is ₦${ride.minOfferNgn.toLocaleString('en-NG')}.`,
        );
      }

      await sendEnvelope('ride:rider_counter_offer', {
        rideId: ride.rideId,
        driverId,
        counterOfferNgn: Math.round(amountNgn),
      });

      setRideState((previous) =>
        previous
          ? {
              ...previous,
              riderOfferNgn: Math.round(amountNgn),
              offers: applyRiderCounter(
                previous.offers ?? [],
                driverId,
                Math.round(amountNgn),
              ),
            }
          : previous,
      );
    },
    [sendEnvelope, setRideState],
  );

  /**
   * Move the rider's own asking price and show it to every candidate driver.
   *
   * This is the lever that unsticks a quiet request. It reuses the rider
   * counter-offer with no driver targeted, which ride-service treats as a
   * broadcast — the same path the WhatsApp flow has always used.
   */
  const updateOffer = useCallback(
    async (amountNgn: number): Promise<void> => {
      const ride = currentRideRef.current;
      if (!ride) {
        throw new Error('You do not have a ride in progress.');
      }

      if (!Number.isFinite(amountNgn) || amountNgn <= 0) {
        throw new Error('Enter a valid amount.');
      }

      if (ride.minOfferNgn !== undefined && amountNgn < ride.minOfferNgn) {
        throw new Error(
          `The lowest you can offer on this trip is ₦${ride.minOfferNgn.toLocaleString('en-NG')}.`,
        );
      }

      const rounded = Math.round(amountNgn);
      await sendEnvelope('ride:rider_counter_offer', {
        rideId: ride.rideId,
        counterOfferNgn: rounded,
      });

      setRideState((previous) =>
        previous ? { ...previous, riderOfferNgn: rounded } : previous,
      );
    },
    [sendEnvelope, setRideState],
  );

  /**
   * Hide a bid the rider is not interested in. Deliberately local-only — the
   * driver is not told, and is free to bid again at a better price.
   */
  const dismissOffer = useCallback(
    (driverId: string) => {
      noteOfferEvent({ at: Date.now(), kind: 'remove', driverId });
      setRideState((previous) =>
        previous
          ? {
              ...previous,
              offers: dismissOfferFrom(previous.offers ?? [], driverId),
            }
          : previous,
      );
      // The driver is told ("Offer declined") and can send a new price.
      const rideId = currentRideRef.current?.rideId;
      if (rideId) void sendEnvelope('ride:decline_offer', { rideId, driverId }).catch(() => undefined);
    },
    [setRideState, sendEnvelope, noteOfferEvent],
  );

  /**
   * The rider's answer to "Auto-book a driver at ₦X?" for a search already
   * open: kept on the ride, and told to the server (ride:auto_accept, with the
   * price it was given for). Only a server that books by itself hears it;
   * an older one never auto-books.
   */
  const setAutoBook = useCallback(
    async (on: boolean, priceNgn?: number): Promise<void> => {
      const ride = currentRideRef.current;
      if (!ride) return;
      setRideState((previous) =>
        previous && previous.rideId === ride.rideId ? { ...previous, autoAcceptChosen: on } : previous,
      );
      if (!ride.autoAcceptSupported) return;
      await sendEnvelope('ride:auto_accept', {
        rideId: ride.rideId,
        on,
        ...(typeof priceNgn === 'number' && priceNgn > 0 ? { priceNgn: Math.round(priceNgn) } : {}),
      });
    },
    [sendEnvelope, setRideState],
  );

  const cancelRide = useCallback(
    async (reason?: string): Promise<void> => {
      const activeRide = currentRideRef.current;
      if (!activeRide?.rideId) {
        clearRide();
        return;
      }

      setError(null);

      await sendEnvelope('ride:cancel', {
        rideId: activeRide.rideId,
        driverId: activeRide.driver?.driverId,
        cancelStage: formatCancelStage(activeRide),
        reason,
      });
    },
    [clearRide, sendEnvelope, user],
  );

  /**
   * Rate the driver of a finished ride.
   *
   * The rating screen used to collect stars and then navigate to the wallet
   * without sending anything anywhere, so every rating a rider ever gave was
   * discarded on the spot.
   */
  const submitRating = useCallback(
    async (input: { rating: number; comment?: string }): Promise<void> => {
      const ride = currentRideRef.current;
      const revieweeId = ride?.driver?.driverUserId;

      if (!ride?.rideId || !revieweeId) {
        throw new Error('There is no completed trip to rate yet.');
      }

      const rating = Math.round(input.rating);
      if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
        throw new Error('Pick between one and five stars.');
      }

      await sendEnvelope('feedback:submit', {
        feedbackId: Crypto.randomUUID(),
        rideId: ride.rideId,
        reviewerRole: 'rider',
        revieweeId,
        rating,
        ...(input.comment ? { comment: input.comment } : {}),
      });
    },
    [sendEnvelope],
  );

  const sendChatMessage = useCallback(
    async (rideId: string, content: string): Promise<void> => {
      await sendEnvelope('chat:send', { rideId, content });
    },
    [sendEnvelope],
  );

  const notifyPaySheet = useCallback(
    (driverId: string, open: boolean): void => {
      const rideId = currentRideRef.current?.rideId;
      if (!rideId) return;
      // Fire and forget. Its replies (ok, or an error) are dropped in handleGatewayMessage.
      void sendEnvelope('ride:pay_sheet', { rideId, driverId, open }).catch(() => undefined);
    },
    [sendEnvelope],
  );

  const sendCallMessage = useCallback(
    async (type: string, payload: Record<string, unknown>): Promise<void> => {
      await sendEnvelope(type, payload);
    },
    [sendEnvelope],
  );

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  // After a restart the app has no trip; the server still does. Restore it
  // (a trip with a driver only), or add the trip code to the one on screen.
  // Back in the foreground with nothing on screen: a scheduled ride may have
  // started its search while the app was away (the socket can stay open in
  // the background on some phones, so its reopening is not a sure signal).
  useEffect(() => {
    if (isDriverApp) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const status = currentRideRef.current?.status;
      // Nothing on screen (a scheduled search may have started), or a search
      // that may have been booked, ended or answered while the app was away.
      if (!status || status === 'bidding' || status === 'requesting') void restoreActiveRideRef.current();
    });
    return () => subscription.remove();
  }, []);

  restoreActiveRideRef.current = async (options) => {
    if (isDriverApp || !isBackendConfigured()) return;
    const current = currentRideRef.current;
    // A ride waiting on its driver ("Confirming") is settled by the server too:
    // the "matched" that ends it may have been lost on the way. So is a
    // search: with the socket away, a booking (auto-accept), the end of the
    // search or the offers may all have been missed.
    const confirming = current?.status === 'matching';
    const searching = current?.status === 'bidding' || current?.status === 'requesting';
    if (current && !confirming && !searching && (current.status !== 'matched' || current.tripCode)) return;
    try {
      const accessToken = await getAccessTokenWithRetry(getAccessToken);
      if (!accessToken) return;
      const fetchStartedAt = Date.now();
      const answer = serverAnswerFrom((await getRiderActiveRide({ accessToken })).ride);
      const sinceFetch = offerEventsSince(fetchStartedAt);
      const restored = answer.kind === 'ride' ? answer.ride : null;
      const now = currentRideRef.current;

      // A search: take what the server says (booked, its offers, or over).
      if (now && (now.status === 'bidding' || now.status === 'requesting')) {
        setRideState((previous) =>
          previous && (previous.status === 'bidding' || previous.status === 'requesting')
            ? (reconcileSearch(previous, answer, Date.now(), sinceFetch) as RiderRideState)
            : previous,
        );
        return;
      }

      // Confirming, and the server still has the search with the chosen offer
      // open (or, an older server, says nothing about the search): the booking
      // may still be going through. Not for ever: a refusal that never arrived
      // kept Confirming up for the whole search. After two 20 s checks like
      // this, back to the offers.
      const chosen = now?.status === 'matching' ? now.driver?.driverId : undefined;
      const stillUnsure =
        now &&
        chosen &&
        ((restored && restored.rideId === now.rideId && stillOpenForChosen(restored, chosen)) ||
          (answer.kind === 'unknown' && answer.rideId === now.rideId));
      if (now && chosen && stillUnsure) {
        if (options?.confirmCheck) confirmChecksRef.current += 1;
        if (confirmChecksRef.current < CONFIRM_STILL_OPEN_LIMIT) return;
        const held = offersBeforeAcceptRef.current;
        offersBeforeAcceptRef.current = null;
        confirmingDriverRef.current = null;
        confirmChecksRef.current = 0;
        setError('Try again.');
        setRideState((previous) =>
          previous && previous.status === 'matching' && previous.rideId === now.rideId && previous.driver?.driverId === chosen
            ? {
                ...previous,
                status: 'bidding',
                driver: undefined,
                bidsCloseAt: restored?.bidsCloseAt ?? previous.bidsCloseAt,
                offers: offersAfterRefusedAccept(
                  offersAfterRefusedAccept(held, previous.offers),
                  (restored?.offers ?? []) as RideOffer[],
                ),
              }
            : previous,
        );
        return;
      }
      setRideState((previous) => {
        if (!previous) return (restored as RiderRideState | null) ?? previous;
        if (previous.status === 'matching') {
          // The server has no search or trip for it any more: the booking did not go through.
          if (!restored || restored.rideId !== previous.rideId) {
            offersBeforeAcceptRef.current = null;
            confirmingDriverRef.current = null;
            confirmChecksRef.current = 0;
            return { ...previous, status: 'cancelled', cancelReason: previous.cancelReason ?? 'driver_unavailable' };
          }
          // Still searching, and the chosen driver's offer is still open: the
          // booking is still going through (a slow moment on the server). Stay
          // on Confirming; showing the offers again let a second driver be booked.
          const chosenId = previous.driver?.driverId;
          if (chosenId && stillOpenForChosen(restored, chosenId)) {
            return previous;
          }
          offersBeforeAcceptRef.current = null;
          confirmingDriverRef.current = null;
          confirmChecksRef.current = 0;
          return {
            ...previous,
            ...restored,
            restored: previous.restored,
            offers: restored.offers ?? [],
            // Another driver booked: that driver alone, never the fare or phone of the one chosen here.
            driver: carryDriver(previous.driver, restored.driver),
          } as RiderRideState;
        }
        if (!restored || previous.rideId !== restored.rideId) return previous;
        return { ...previous, tripCode: previous.tripCode ?? restored.tripCode };
      });
    } catch {
      /* the next reconnect tries again */
    }
  };

  // The offers as the server has them (after an accept refused as
  // 'offer_changed'): current prices, nobody who has withdrawn. Only for the
  // search on screen, and only while it is still a search.
  refreshOffersRef.current = async () => {
    if (isDriverApp || !isBackendConfigured()) return;
    try {
      const accessToken = await getAccessTokenWithRetry(getAccessToken);
      if (!accessToken) return;
      const fetchStartedAt = Date.now();
      const restored = restoredRideFrom((await getRiderActiveRide({ accessToken })).ride);
      if (!restored || restored.status !== 'bidding') return;
      const sinceFetch = offerEventsSince(fetchStartedAt);
      setRideState((previous) =>
        previous && previous.rideId === restored.rideId && previous.status === 'bidding'
          ? {
              ...previous,
              autoAcceptSupported: true,
              offers: offersAfterServerList(previous.offers ?? [], (restored.offers ?? []) as RideOffer[], sinceFetch),
            }
          : previous,
      );
    } catch {
      /* the offers on screen stay; the next tap is checked again by the server */
    }
  };

  // "Confirming your driver" never waits on a lost message: after a short
  // while, the server says where the booking stands.
  const confirmingRideId = currentRide?.status === 'matching' ? currentRide.rideId : null;
  useEffect(() => {
    if (isDriverApp || !confirmingRideId) return;
    // Asked again every 20 s for as long as it is confirming.
    const timer = setInterval(() => void restoreActiveRideRef.current({ confirmCheck: true }), CONFIRM_RESYNC_MS);
    return () => clearInterval(timer);
  }, [confirmingRideId]);

  useEffect(() => {
    // One socket per user. The driver app has its own session (driver-session),
    // and it carries everything a driver needs; opening this one as well gave
    // every online driver two sockets, and the server twice the work. A rider
    // screen that does send something here still connects on demand.
    if (isDriverApp) {
      shouldMaintainConnectionRef.current = false;
      return;
    }
    if (!isBackendConfigured() || !isReady || !user) {
      shouldMaintainConnectionRef.current = false;
      clearReconnectTimer();
      connectPromiseRef.current = null;
      setConnectionState('disconnected');

      const socket = socketRef.current;
      socketRef.current = null;
      if (socket) {
        socket.close();
      }

      return;
    }

    shouldMaintainConnectionRef.current = true;
    backoffRef.current.reset();
    void connect().catch(() => {
      // Silent retry — don't show connection errors to the rider
      // scheduleReconnect is already called in socket.onerror/onclose
    });

    return () => {
      shouldMaintainConnectionRef.current = false;
      clearReconnectTimer();
    };
  }, [clearReconnectTimer, connect, isReady, user]);

  const value = useMemo<RideSessionContextValue>(
    () => ({
      isConfigured: isBackendConfigured(),
      connectionState,
      currentRide,
      chatMessages,
      error,
      requestRide,
      dismissOffer,
      setAutoBook,
      counterOffer,
      updateOffer,
      acceptOffer,
      updateRideRoute,
      quoteRideRoute,
      cancelRide,
      submitRating,
      sendChatMessage,
      sendCallMessage,
      clearRide,
      notifyPaySheet,
    }),
    [
      acceptOffer,
      setAutoBook,
      cancelRide,
      submitRating,
      chatMessages,
      clearRide,
      connectionState,
      counterOffer,
      updateOffer,
      currentRide,
      dismissOffer,
      error,
      requestRide,
      sendChatMessage,
      sendCallMessage,
      notifyPaySheet,
      updateRideRoute,
      quoteRideRoute,
    ],
  );

  return (
    <RideSessionContext.Provider value={value}>
      {children}
    </RideSessionContext.Provider>
  );
}

export function useRideSession(): RideSessionContextValue {
  return useContext(RideSessionContext);
}
