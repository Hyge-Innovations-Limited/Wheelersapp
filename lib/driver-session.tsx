import { Alert, AppState, type AppStateStatus } from 'react-native';
import { maxBidNgn } from '@/lib/bid-limits';
import { useAuth } from '@/lib/auth';
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

import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  getBackendWebSocketUrl,
  getDriverActiveRide,
  getDriverBids,
  isBackendConfigured,
  type DriverActiveRide,
} from '@/lib/api';
import { getAccessTokenWithRetry } from '@/lib/access-token';
import { startDriverLivenessUpdates, stopDriverLivenessUpdates } from '@/lib/background-location';
import { pauseStandbyUpdates, resumeStandbyIfEnabled } from '@/lib/standby-location';
import {
  applyActiveRideSnapshot,
  defaultDriverSession,
  dismissBid as dismissBidState,
  dismissMissedOffer as dismissMissedOfferState,
  getString,
  hydrateBidRecords,
  pruneExpiredBids,
  rehydrateMarket,
  selectOfferState,
  recordBid,
  reduceDriverSession,
  type DriverSessionState,
  type GroupSeat,
} from '@/lib/driver-session-reducer';
import { estimateEtaSeconds, haversineKm } from '@/lib/geo';
import { invalidateWalletCache } from '@/lib/wallet-overview';

/** Where the live market snapshot survives JS reloads. */
const MARKET_STORAGE_KEY = 'wheelers.driver.market.v1';

export type {
  DriverRide,
  DriverSessionState,
  DriverStatus,
  GroupSeat,
  PendingBid,
  RideOffer,
} from '@/lib/driver-session-reducer';

type DriverConnectionState = 'disconnected' | 'connecting' | 'connected';

export type ChatMessage = {
  id: string;
  rideId: string;
  senderId: string;
  senderRole: 'RIDER' | 'DRIVER';
  content: string;
  createdAt: string;
};

type DriverSessionContextValue = {
  isConfigured: boolean;
  connectionState: DriverConnectionState;
  session: DriverSessionState;
  chatMessages: ChatMessage[];
  error: string | null;
  goOnline: (lat: number, lng: number) => Promise<void>;
  goOffline: () => Promise<void>;
  acceptRide: (
    rideId: string,
    counterOfferNgn?: number,
    origin?: { lat: number; lng: number },
  ) => Promise<void>;
  bidOnSeat: (
    seat: GroupSeat,
    amountNgn?: number,
    origin?: { lat: number; lng: number },
  ) => Promise<void>;
  rejectRide: (rideId: string) => Promise<void>;
  /**
   * Give up an assigned trip (rider no-show, wrong pickup, can't reach them).
   * The ride goes back to the rider to re-match.
   */
  cancelTrip: (rideId: string, reason?: string) => Promise<void>;
  /**
   * Ask the backend which ride (if any) this driver is assigned to and adopt
   * it. Returns true when an active ride was found.
   */
  syncActiveRide: () => Promise<boolean>;
  /** Swipe away a resolved (expired/lost) bid card. */
  dismissBid: (rideId: string) => void;
  dismissMissedOffer: (rideId: string) => void;
  /** Rate the rider after a trip — feeds their rider rating. */
  rateRider: (rideId: string, riderId: string, rating: number) => Promise<void>;
  /** Open one of the queued requests. */
  selectOffer: (rideId: string) => void;
  /** Close the open request without rejecting it — it stays in the queue. */
  closeOffer: () => void;
  arriveAtPickup: (rideId: string) => Promise<void>;
  startTrip: (rideId: string) => Promise<void>;
  endTrip: (rideId: string) => Promise<void>;
  sendGps: (lat: number, lng: number) => void;
  sendChatMessage: (rideId: string, content: string) => Promise<void>;
  clearCompleted: () => void;
};

type GatewayMessage = {
  type?: string;
  payload?: Record<string, unknown>;
};

const reconnectDelayMs = 1500;

/**
 * How long a ride the driver just finished (or cancelled) stays off-limits to
 * the active-ride sync. The gateway acks "end"/"cancel" immediately, but the
 * DB row is written by ride-service a moment later — a foreground sync in
 * that gap would happily re-adopt the trip the driver just closed.
 */
const recentlyEndedTtlMs = 5 * 60_000;

const defaultContext: DriverSessionContextValue = {
  isConfigured: false,
  connectionState: 'disconnected',
  session: defaultDriverSession,
  chatMessages: [],
  error: null,
  goOnline: async (_lat: number, _lng: number) => { throw new Error('Driver session unavailable.'); },
  goOffline: async () => { throw new Error('Driver session unavailable.'); },
  acceptRide: async (_rideId: string, _counterOfferNgn?: number) => { throw new Error('Driver session unavailable.'); },
  bidOnSeat: async () => { throw new Error('Driver session unavailable.'); },
  selectOffer: (_rideId: string) => {},
  closeOffer: () => {},
  rejectRide: async () => { throw new Error('Driver session unavailable.'); },
  cancelTrip: async () => { throw new Error('Driver session unavailable.'); },
  syncActiveRide: async () => false,
  dismissBid: () => undefined,
  dismissMissedOffer: () => undefined,
  rateRider: async () => { throw new Error('Driver session unavailable.'); },
  arriveAtPickup: async () => { throw new Error('Driver session unavailable.'); },
  startTrip: async () => { throw new Error('Driver session unavailable.'); },
  endTrip: async () => { throw new Error('Driver session unavailable.'); },
  sendGps: () => undefined,
  sendChatMessage: async () => { throw new Error('Driver session unavailable.'); },
  clearCompleted: () => undefined,
};

const DriverSessionContext = createContext<DriverSessionContextValue>(defaultContext);

export function DriverSessionProvider({ children }: { children: ReactNode }) {
  const { user, isReady, getAccessToken } = useAuth();

  const [connectionState, setConnectionState] = useState<DriverConnectionState>('disconnected');
  const [session, setSession] = useState<DriverSessionState>(defaultDriverSession);
  const [error, setError] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  const socketRef = useRef<WebSocket | null>(null);
  const connectPromiseRef = useRef<Promise<WebSocket> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldMaintainConnectionRef = useRef(false);
  /** The driver pressed Go Online and has not pressed Go Offline since. */
  const wantsOnlineRef = useRef(false);
  const lastAlertRef = useRef<{ message: string; at: number }>({ message: '', at: 0 });
  const lastOnlineCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const userRef = useRef(user);
  const sessionRef = useRef(session);
  const connectRef = useRef<(() => Promise<WebSocket>) | null>(null);
  const recentlyEndedRef = useRef<Map<string, number>>(new Map());

  const markRideEnded = useCallback((rideId: string | undefined) => {
    if (!rideId) return;
    recentlyEndedRef.current.set(rideId, Date.now());
  }, []);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const handleGatewayMessage = useCallback(
    (message: GatewayMessage) => {
      const { type, payload } = message;
      if (!type || !payload) return;

      if (type === 'error') {
        // Nothing on the driver screens rendered `error`, so a rejected bid
        // ("finish your current trip", "request no longer open", "above the
        // ₦500/km cap") was invisible and the bid card stayed optimistic.
        const message = getString(payload.message) ?? 'Driver session error.';
        setError(message);
        const now = Date.now();
        if (message !== lastAlertRef.current.message || now - lastAlertRef.current.at > 3_000) {
          lastAlertRef.current = { message, at: now };
          Alert.alert('Wheelers', message);
        }
        const rejectedRideId = getString(payload.rideId);
        if (rejectedRideId) {
          setSession((prev) => reduceDriverSession(prev, 'ride:bid_withdrawn', { rideId: rejectedRideId, reason: 'rejected' }) ?? prev);
        }
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

        const msg: ChatMessage = {
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

      if (type === 'wallet:updated') {
        invalidateWalletCache();
        return;
      }

      if (
        type === 'ride:cancelled' ||
        type === 'ride:cancel:accepted' ||
        type === 'ride:end:accepted' ||
        type === 'ride:completed'
      ) {
        markRideEnded(getString(payload.rideId) ?? sessionRef.current.currentRide?.rideId);
      }

      // Everything else is a session transition — see driver-session-reducer.
      setSession((prev) => reduceDriverSession(prev, type, payload) ?? prev);

      if (type === 'ride:cancelled') {
        setError('Ride was cancelled.');
        Alert.alert('Ride cancelled', getString(payload.reason) ? `The rider cancelled: ${getString(payload.reason)}` : 'The rider cancelled this ride.');
      }
    },
    [markRideEnded],
  );

  const scheduleReconnect = useCallback(() => {
    if (!shouldMaintainConnectionRef.current || !userRef.current || reconnectTimerRef.current) {
      return;
    }
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      if (!shouldMaintainConnectionRef.current || !userRef.current) return;
      void connect().catch(() => undefined);
    }, reconnectDelayMs);
  }, []);

  const syncActiveRide = useCallback(async (): Promise<boolean> => {
    if (!isBackendConfigured() || !userRef.current) return false;
    let accessToken: string | null = null;
    try {
      accessToken = await getAccessTokenWithRetry(getAccessToken);
    } catch {
      return false;
    }
    if (!accessToken) return false;

    let ride: DriverActiveRide | null;
    try {
      ride = (await getDriverActiveRide({ accessToken })).ride;
    } catch (err) {
      console.warn('[driver-session] active ride sync failed', err instanceof Error ? err.message : String(err));
      return false;
    }

    if (!ride) return false;

    const endedAt = recentlyEndedRef.current.get(ride.rideId);
    if (endedAt !== undefined && Date.now() - endedAt < recentlyEndedTtlMs) {
      // We closed this trip moments ago; the backend just hasn't caught up.
      return false;
    }

    setSession((prev) => applyActiveRideSnapshot(prev, ride));

    // A trip needs the socket: GPS, arrive/start/end, the rider's messages.
    // After a cold start the driver hasn't pressed "Go Online", so nothing
    // else would open it — and nothing would reconnect it if it dropped.
    if (!shouldMaintainConnectionRef.current) {
      shouldMaintainConnectionRef.current = true;
      void connectRef.current?.().catch(() => undefined);
    }
    return true;
  }, [getAccessToken]);

  const backfillBids = useCallback(async (): Promise<void> => {
    if (!isBackendConfigured() || !userRef.current) return;
    try {
      const accessToken = await getAccessTokenWithRetry(getAccessToken);
      if (!accessToken) return;
      const { items } = await getDriverBids({ accessToken, limit: 10 });
      setSession((prev) => hydrateBidRecords(prev, items, Date.now()));
    } catch {
      // backfill is best-effort; the socket remains the source of truth
    }
  }, [getAccessToken]);

  const connect = useCallback(async (): Promise<WebSocket> => {
    if (!isBackendConfigured() || !isReady || !user) {
      throw new Error('Not configured or not signed in.');
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
        throw new Error('Could not get access token.');
      }

      const wsUrl = `${wsBaseUrl}?token=${encodeURIComponent(accessToken)}`;
      const socket = new WebSocket(wsUrl);

      return new Promise<WebSocket>((resolve, reject) => {
        const timeout = setTimeout(() => {
          socket.close();
          reject(new Error('WebSocket connection timed out.'));
        }, 10_000);

        socket.onopen = () => {
          clearTimeout(timeout);
          socketRef.current = socket;
          connectPromiseRef.current = null;
          setConnectionState('connected');
          setError(null);
          // A reconnect while the driver believes they're online must
          // re-announce — the backend re-sends any ride requests that opened
          // (or were missed) during the connection gap. Without this, a
          // network blip silently cost the driver every request in flight.
          const lastOnline = lastOnlineCoordsRef.current;
          if (shouldMaintainConnectionRef.current && lastOnline && wantsOnlineRef.current) {
            if (sessionRef.current.currentRide) {
              // Mid-trip: announcing "online" put this driver back in the
              // matching pool and flipped ON_RIDE to ONLINE. A position ping
              // keeps them alive without re-listing them.
              socket.send(JSON.stringify({
                type: 'driver:gps',
                payload: { rideId: sessionRef.current.currentRide.rideId, ...lastOnline, timestamp: new Date().toISOString() },
              }));
            } else {
              socket.send(JSON.stringify({ type: 'driver:online', payload: lastOnline }));
            }
          }
          // The gateway also re-sends ride:matched for an assigned ride on
          // connect; this REST check is the belt to that brace — it survives
          // an older gateway and a dropped first frame.
          void syncActiveRide();
          void backfillBids();
          resolve(socket);
        };

        socket.onmessage = (event) => {
          try {
            const parsed = JSON.parse(String(event.data)) as GatewayMessage;
            handleGatewayMessage(parsed);
          } catch {
            // ignore
          }
        };

        socket.onerror = () => {
          clearTimeout(timeout);
          if (connectPromiseRef.current && socketRef.current !== socket) {
            // A newer socket is already being opened; this is the old one.
            reject(new Error('WebSocket connection error.'));
            return;
          }
          connectPromiseRef.current = null;
          setConnectionState('disconnected');
          scheduleReconnect();
          reject(new Error('WebSocket connection error.'));
        };

        socket.onclose = () => {
          clearTimeout(timeout);
          // Only the CURRENT socket's close means we are disconnected. A
          // timed-out socket closing after its replacement opened used to
          // null the live ref, stop GPS, and open a third, orphaned socket.
          if (socketRef.current !== null && socketRef.current !== socket) return;
          socketRef.current = null;
          connectPromiseRef.current = null;
          setConnectionState('disconnected');
          scheduleReconnect();
        };
      });
    })();

    try {
      return await connectPromiseRef.current;
    } catch (err) {
      connectPromiseRef.current = null;
      setConnectionState('disconnected');
      scheduleReconnect();
      throw err;
    }
  }, [backfillBids, clearReconnectTimer, getAccessToken, handleGatewayMessage, isReady, scheduleReconnect, syncActiveRide, user]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const sendEnvelope = useCallback(
    async (type: string, payload: Record<string, unknown>): Promise<void> => {
      const socket = await connect();
      if (socket.readyState !== WebSocket.OPEN) {
        throw new Error('Driver session is not connected.');
      }
      socket.send(JSON.stringify({ type, payload }));
    },
    [connect],
  );

  const goOnline = useCallback(async (lat: number, lng: number) => {
    console.log('[driver-session] goOnline called with', { lat, lng });
    shouldMaintainConnectionRef.current = true;
    wantsOnlineRef.current = true;
    lastOnlineCoordsRef.current = { lat, lng };
    try {
      await connect();
      console.log('[driver-session] connected, sending driver:online');
      await sendEnvelope('driver:online', { lat, lng });
      console.log('[driver-session] driver:online sent');
      // The pocket heartbeat: keeps this driver alive in matching when the
      // app backgrounds and the socket dies. Best-effort by design.
      // The rough off-shift updates stop first so the two never run together.
      void pauseStandbyUpdates()
        .then(() => getAccessTokenWithRetry(getAccessToken))
        .then((token) => (token ? startDriverLivenessUpdates(token) : undefined))
        .catch(() => undefined);
      setSession((prev) => ({ ...prev, status: prev.currentRide ? prev.status : 'online' }));
      setError(null);
    } catch (err) {
      console.log('[driver-session] connection failed, will retry', err instanceof Error ? err.message : String(err));
      scheduleReconnect();
    }
  }, [connect, sendEnvelope, scheduleReconnect, getAccessToken]);

  const goOffline = useCallback(async () => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'driver:offline', payload: { reason: 'manual' } }));
    }
    shouldMaintainConnectionRef.current = false;
    wantsOnlineRef.current = false;
    lastOnlineCoordsRef.current = null;
    // Off shift: hand over to "nearby ride alerts" — a no-op unless the driver
    // switched it on in Settings.
    void stopDriverLivenessUpdates()
      .then(() => getAccessTokenWithRetry(getAccessToken))
      .then((token) => (token ? resumeStandbyIfEnabled(token) : undefined))
      .catch(() => undefined);
    clearReconnectTimer();
    socketRef.current = null;
    if (socket) socket.close();
    connectPromiseRef.current = null;
    setConnectionState('disconnected');
    setSession(defaultDriverSession);
    setError(null);
  }, [clearReconnectTimer, getAccessToken]);

  const acceptRide = useCallback(
    async (rideId: string, counterOfferNgn?: number, origin?: { lat: number; lng: number }) => {
      // Bids come from the feed card as often as from the open request modal
      // now — resolve the offer from wherever it lives.
      const { currentOffer, offers, pendingBids } = sessionRef.current;
      const offer =
        (currentOffer?.rideId === rideId ? currentOffer : undefined) ??
        offers.find((queued) => queued.rideId === rideId) ??
        // Re-bidding/accepting on a countered negotiation: the request lives
        // on the bid card by then, not in the queue.
        pendingBids[rideId]?.offer;
      if (!offer) {
        throw new Error('No matching ride offer to accept.');
      }

      const amountNgn = counterOfferNgn ?? offer.riderOfferNgn ?? offer.fareEstimateNgn;

      // ₦500/km ceiling. The +100/+500 chips and "change bid" never checked
      // it; the server now rejects, but the driver should hear it here.
      const cap = maxBidNgn(offer.plannedDistanceKm);
      if (cap !== null && amountNgn > cap) {
        throw new Error(`The most you can bid on this trip is ₦${cap.toLocaleString('en-NG')} (₦500 per km).`);
      }

      // Real ETA from live GPS (or the backend's match-time seed) — the
      // server recomputes from its own copy too, but never send the old
      // hardcoded 300 that told every rider "5 min away".
      const pickupKm = origin
        ? haversineKm(origin.lat, origin.lng, offer.pickup.lat, offer.pickup.lng)
        : offer.pickupDistanceKm;
      const etaSeconds =
        pickupKm !== undefined ? estimateEtaSeconds(pickupKm) : offer.pickupEtaSeconds ?? 300;

      await sendEnvelope('driver:accept', {
        rideId,
        riderId: offer.riderId,
        driverName: 'Driver',
        driverRating: 5.0,
        vehiclePlate: 'N/A',
        vehicleModel: 'N/A',
        etaSeconds,
        agreedFareNgn: amountNgn,
      });

      // Remember the bid past the offer card's 30s life — the rider has
      // minutes to answer, and ride:matched must survive that gap.
      setSession((prev) => recordBid(prev, offer, amountNgn));
    },
    [sendEnvelope],
  );

  /**
   * Bid on ONE seat of a group ride. Reuses the driver:accept envelope with
   * the member's own ride id — the backend routes it to that rider alone.
   */
  const bidOnSeat = useCallback(
    async (seat: GroupSeat, amountNgn?: number, origin?: { lat: number; lng: number }) => {
      const finalAmount = amountNgn ?? seat.offerNgn;
      const pickupKm = origin
        ? haversineKm(origin.lat, origin.lng, seat.pickup.lat, seat.pickup.lng)
        : undefined;
      const etaSeconds = pickupKm !== undefined ? estimateEtaSeconds(pickupKm) : 300;

      await sendEnvelope('driver:accept', {
        rideId: seat.rideId,
        riderId: seat.riderId,
        driverName: 'Driver',
        driverRating: 5.0,
        vehiclePlate: 'N/A',
        vehicleModel: 'N/A',
        etaSeconds,
        agreedFareNgn: finalAmount,
      });
    },
    [sendEnvelope],
  );

  const rejectRide = useCallback(
    async (rideId: string) => {
      await sendEnvelope('driver:reject', {
        rideId,
        riderId: sessionRef.current.currentOffer?.riderId ?? '',
        reason: 'manual_reject',
      });
    },
    [sendEnvelope],
  );

  const cancelTrip = useCallback(
    async (rideId: string, reason?: string) => {
      await sendEnvelope('ride:cancel', {
        rideId,
        ...(reason ? { reason } : {}),
      });
      // The ack (ride:cancel:accepted) clears the trip too; doing it here as
      // well means the screen moves on even if that frame is lost.
      markRideEnded(rideId);
      setSession((prev) => reduceDriverSession(prev, 'ride:cancel:accepted', { rideId }) ?? prev);
    },
    [markRideEnded, sendEnvelope],
  );

  const arriveAtPickup = useCallback(
    async (rideId: string) => {
      await sendEnvelope('ride:arrived', { rideId });
      setSession((prev) => ({ ...prev, status: 'arrived' }));
    },
    [sendEnvelope],
  );

  const startTrip = useCallback(
    async (rideId: string) => {
      const ride = sessionRef.current.currentRide;
      await sendEnvelope('ride:start', {
        rideId,
        riderId: ride?.riderId ?? '',
        lockedFareNgn: ride?.fareNgn ?? 0,
      });
    },
    [sendEnvelope],
  );

  const endTrip = useCallback(
    async (rideId: string) => {
      const ride = sessionRef.current.currentRide;
      await sendEnvelope('ride:end', {
        rideId,
        riderId: ride?.riderId ?? '',
        fareNgn: ride?.fareNgn,
        endedBy: 'both_confirmed',
      });
    },
    [sendEnvelope],
  );

  const sendGps = useCallback(
    (lat: number, lng: number) => {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      // With a ride: full trip telemetry keyed by rideId. Without one: an
      // idle position ping so the backend's copy of where this driver is
      // doesn't stay frozen at wherever they went online — matching and the
      // pickup distances riders see depend on it.
      const ride = sessionRef.current.currentRide;
      lastOnlineCoordsRef.current = { lat, lng };
      socket.send(
        JSON.stringify({
          type: 'driver:gps',
          payload: ride
            ? { rideId: ride.rideId, lat, lng, timestamp: new Date().toISOString() }
            : { lat, lng, timestamp: new Date().toISOString() },
        }),
      );
    },
    [],
  );

  const sendChatMessage = useCallback(
    async (rideId: string, content: string) => {
      await sendEnvelope('chat:send', { rideId, content });
    },
    [sendEnvelope],
  );

  // Tapping must never delete. This used to prune expired offers on the way
  // in, so tapping a stale card removed it instead of opening it.
  const selectOffer = useCallback((rideId: string) => {
    setSession((prev) => selectOfferState(prev, rideId));
  }, []);

  const closeOffer = useCallback(() => {
    setSession((prev) => ({ ...prev, currentOffer: null }));
  }, []);

  const dismissMissedOffer = useCallback((rideId: string) => {
    setSession((prev) => dismissMissedOfferState(prev, rideId));
  }, []);

  const dismissBid = useCallback((rideId: string) => {
    setSession((prev) => dismissBidState(prev, rideId));
  }, []);

  const rateRider = useCallback(
    async (rideId: string, riderId: string, rating: number) => {
      await sendEnvelope('feedback:submit', {
        rideId,
        revieweeId: riderId,
        rating,
        reviewerRole: 'DRIVER',
      });
    },
    [sendEnvelope],
  );

  const clearCompleted = useCallback(() => {
    markRideEnded(sessionRef.current.currentRide?.rideId);
    setSession((prev) => ({
      ...prev,
      status: 'online',
      offers: [],
      currentOffer: null,
      currentRide: null,
      pendingBids: {},
    }));
    setChatMessages([]);
    setError(null);
  }, [markRideEnded]);

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
      if (socket) socket.close();
      return;
    }
  }, [clearReconnectTimer, isReady, user]);

  // A cold start mid-trip: the phone died, the app was killed, the driver
  // reinstalled. The backend still has them on a ride — pick it back up
  // without waiting for "Go Online".
  useEffect(() => {
    if (!isBackendConfigured() || !isReady || !user) return;
    void syncActiveRide();
  }, [isReady, user, syncActiveRide]);

  // A dropped ride:bid_timeout frame must not leave "waiting for rider" on
  // screen forever. One sweep, all the linger rules — stale offers stay
  // biddable through theirs; a second prune here used to delete them.
  useEffect(() => {
    const timer = setInterval(() => {
      setSession((prev) => pruneExpiredBids(prev, Date.now()));
    }, 15_000);
    return () => clearInterval(timer);
  }, []);

  // The market (requests, bids, missed cards) survives a JS reload: persist
  // on change, rehydrate once on mount. Live socket truth always wins.
  const marketHydratedRef = useRef(false);
  useEffect(() => {
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(MARKET_STORAGE_KEY);
        if (raw) {
          const snapshot = JSON.parse(raw) as unknown;
          setSession((prev) => rehydrateMarket(prev, snapshot, Date.now()));
        }
      } catch {
        // a bad snapshot is not worth a crash
      } finally {
        marketHydratedRef.current = true;
      }
    })();
  }, []);

  const marketOffers = session.offers;
  const marketBids = session.pendingBids;
  const marketMissed = session.missedOffers;
  useEffect(() => {
    if (!marketHydratedRef.current) return;
    AsyncStorage.setItem(
      MARKET_STORAGE_KEY,
      JSON.stringify({ offers: marketOffers, pendingBids: marketBids, missedOffers: marketMissed }),
    ).catch(() => {});
  }, [marketOffers, marketBids, marketMissed]);

  // A parked driver gets no GPS fixes (both platforms filter by distance),
  // so nothing refreshed lastSeenAt and the backend dropped them from
  // matching after 90 s, then rejected the rider's "pay" as "driver
  // unavailable". Re-send the last known position every 30 s while online.
  useEffect(() => {
    const timer = setInterval(() => {
      const coords = lastOnlineCoordsRef.current;
      if (!shouldMaintainConnectionRef.current || !coords) return;
      sendGps(coords.lat, coords.lng);
    }, 30_000);
    return () => clearInterval(timer);
  }, [sendGps]);

  // Coming back from the background is exactly when a match was missed: the
  // socket is dead while the app is suspended, and the rider paid meanwhile.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next !== 'active') return;
      if (!shouldMaintainConnectionRef.current || !userRef.current) return;
      void syncActiveRide();
    });
    return () => subscription.remove();
  }, [syncActiveRide]);

  const value = useMemo<DriverSessionContextValue>(
    () => ({
      isConfigured: isBackendConfigured(),
      connectionState,
      session,
      chatMessages,
      error,
      goOnline,
      goOffline,
      acceptRide,
      bidOnSeat,
      rejectRide,
      cancelTrip,
      syncActiveRide,
      dismissBid,
      dismissMissedOffer,
      rateRider,
      selectOffer,
      closeOffer,
      arriveAtPickup,
      startTrip,
      endTrip,
      sendGps,
      sendChatMessage,
      clearCompleted,
    }),
    [
      connectionState,
      session,
      chatMessages,
      error,
      goOnline,
      goOffline,
      acceptRide,
      bidOnSeat,
      rejectRide,
      cancelTrip,
      syncActiveRide,
      dismissBid,
      dismissMissedOffer,
      rateRider,
      selectOffer,
      closeOffer,
      arriveAtPickup,
      startTrip,
      endTrip,
      sendGps,
      sendChatMessage,
      clearCompleted,
    ],
  );

  return (
    <DriverSessionContext.Provider value={value}>
      {children}
    </DriverSessionContext.Provider>
  );
}

export function useDriverSession(): DriverSessionContextValue {
  return useContext(DriverSessionContext);
}
