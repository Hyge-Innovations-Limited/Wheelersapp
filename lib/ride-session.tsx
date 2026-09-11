import * as Crypto from 'expo-crypto';
import {
  applyRiderCounter,
  dismissOffer as dismissOfferFrom,
  mergeOffer,
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
} from '@/lib/api';
import { resolvePlaceQuery } from '@/lib/google-places';
import { isCurrentLocationLabel, serializeRideItinerary, type RideItinerary } from '@/lib/ride-route';
import { invalidateWalletCache } from '@/lib/wallet-overview';

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
  /** Set when the window closed with nobody accepting. */
  bidTimeout?: boolean;
  startedAt?: string;
  completedAt?: string;
  completedFareNgn?: number;
  cancelReason?: string;
  cancelStage?: string;
};

export type RideChatMessage = {
  id: string;
  rideId: string;
  senderId: string;
  senderRole: 'RIDER' | 'DRIVER';
  content: string;
  createdAt: string;
};

type RideSessionContextValue = {
  isConfigured: boolean;
  connectionState: RideConnectionState;
  currentRide: RiderRideState | null;
  chatMessages: RideChatMessage[];
  error: string | null;
  requestRide: (itinerary: RideItinerary, options?: { offerNgn?: number }) => Promise<void>;
  /** Take a driver's bid — this is what actually books the ride. */
  acceptOffer: (driverId: string) => Promise<void>;
  /** Counter a specific driver with a different price. */
  counterOffer: (driverId: string, amountNgn: number) => Promise<void>;
  /** Move the rider's own price and re-offer the trip to every driver. */
  updateOffer: (amountNgn: number) => Promise<void>;
  /** Hide a driver's bid locally; they can still re-bid. */
  dismissOffer: (driverId: string) => void;
  updateRideRoute: (itinerary: RideItinerary) => Promise<void>;
  cancelRide: (reason?: string) => Promise<void>;
  /** Rate the driver of the ride that just finished. */
  submitRating: (input: { rating: number; comment?: string }) => Promise<void>;
  sendChatMessage: (rideId: string, content: string) => Promise<void>;
  clearRide: () => void;
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
const reconnectDelayMs = 1500;

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
  updateRideRoute: async () => {
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
  clearRide: () => undefined,
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

export function RideSessionProvider({ children }: { children: ReactNode }) {
  const { getAccessToken, isReady, user } = useAuth();
  const [connectionState, setConnectionState] = useState<RideConnectionState>('disconnected');
  const [currentRide, setCurrentRide] = useState<RiderRideState | null>(null);
  const [chatMessages, setChatMessages] = useState<RideChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const connectPromiseRef = useRef<Promise<WebSocket> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldMaintainConnectionRef = useRef(false);
  const currentRideRef = useRef<RiderRideState | null>(null);
  const userRef = useRef(user);

  // The device fix, kept in a ref so requestRide reads the newest value without
  // being rebuilt (and re-subscribing the socket) on every GPS update.
  const { currentLocation } = useAppLocation();
  const currentLocationRef = useRef(currentLocation);
  useEffect(() => {
    currentLocationRef.current = currentLocation;
  }, [currentLocation]);

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

      if (type === 'error') {
        setError(getString(payload.message) ?? 'Ride session error.');
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

        setRideState((previous) => {
          if (!previous) {
            return previous;
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
        setRideState((previous) =>
          previous ? { ...previous, status: 'bidding', bidTimeout: true, offers: [] } : previous,
        );
        return;
      }

      if (type === 'ride:matched') {
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
              lockedFareNgn:
                getNumber(payload.lockedFareNgn) ?? previous.driver?.lockedFareNgn,
              driverPhone: getString(payload.driverPhone) ?? previous.driver?.driverPhone,
            },
          };
        });
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
        setRideState((previous) => {
          if (!previous) {
            return previous;
          }

          return {
            ...previous,
            status: 'cancelled',
            cancelReason: getString(payload.reason) ?? previous.cancelReason,
            cancelStage: getString(payload.cancelStage) ?? previous.cancelStage,
          };
        });
        return;
      }

      if (type === 'ride:driver_rejected') {
        setError('A driver skipped this request. Reassigning another nearby driver.');
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
    [setRideState],
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
    }, reconnectDelayMs);
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
          setConnectionState('connected');
          setError(null);
          resolve(socket);
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
    async (itinerary: RideItinerary, options?: { offerNgn?: number }): Promise<void> => {
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
      setRideState({
        rideId,
        status: 'requesting',
        itinerary,
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

  const updateRideRoute = useCallback(
    async (itinerary: RideItinerary): Promise<void> => {
      const activeRide = currentRideRef.current;
      if (!activeRide?.rideId) {
        throw new Error('There is no live ride route to update yet.');
      }

      const resolvedRoute = await resolveRideRoute(itinerary);
      setError(null);

      await sendEnvelope('ride:route:update', {
        rideId: activeRide.rideId,
        driverId: activeRide.driver?.driverId,
        destination: resolvedRoute.destination,
        stops: resolvedRoute.stops,
      });

      setRideState((previous) => {
        if (!previous) {
          return previous;
        }

        return {
          ...previous,
          itinerary,
        };
      });
    },
    [sendEnvelope, setRideState],
  );

  /**
   * Take a driver's bid. This is the moment the ride is actually booked: the
   * backend locks the agreed fare against the rider's wallet and tells the
   * driver they won.
   */
  const acceptOffer = useCallback(
    async (driverId: string): Promise<void> => {
      const ride = currentRideRef.current;
      const offer = ride?.offers?.find((item) => item.driverId === driverId);

      if (!ride || !offer) {
        throw new Error('That bid is no longer available.');
      }

      await sendEnvelope('ride:accept_offer', {
        rideId: ride.rideId,
        driverId: offer.driverId,
        driverUserId: offer.driverUserId,
        agreedFareNgn: offer.counterOfferNgn,
        paymentMethod: 'wallet_balance',
      });

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
              driver: {
                ...previous.driver,
                driverId: offer.driverId,
                driverUserId: offer.driverUserId,
                driverName: offer.driverName,
                driverRating: offer.driverRating,
                vehiclePlate: offer.vehiclePlate,
                vehicleModel: offer.vehicleModel,
                etaSeconds: offer.etaSeconds,
                lockedFareNgn: offer.counterOfferNgn,
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
      setRideState((previous) =>
        previous
          ? {
              ...previous,
              offers: dismissOfferFrom(previous.offers ?? [], driverId),
            }
          : previous,
      );
    },
    [setRideState],
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

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
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
      counterOffer,
      updateOffer,
      acceptOffer,
      updateRideRoute,
      cancelRide,
      submitRating,
      sendChatMessage,
      clearRide,
    }),
    [
      acceptOffer,
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
      updateRideRoute,
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
