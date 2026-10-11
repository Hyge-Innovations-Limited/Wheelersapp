/**
 * The rider's finished rides, as the server has them: the list behind Trips
 * and the one ride behind a receipt.
 *
 * `lib/rider-history.ts` gives ready-made list text; these screens need the
 * addresses, amounts and dates themselves (to book a ride again, to show a
 * cancelled ride differently), so this reads the same endpoint unshaped.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { getAccessTokenWithRetry } from "@/lib/access-token";
import {
  apiRequest,
  getRiderRideHistory,
  isBackendConfigured,
  type RiderHistoryRide,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { serializeRideItinerary } from "@/lib/ride-route";

/* ── one ride ──────────────────────────────────────────────────────────── */

export type RideDetailStop = {
  order: number;
  type: "INTERMEDIATE" | "FINAL" | (string & {});
  status: string;
  lat: number;
  lng: number;
  address: string;
  completedAt: string | null;
};

/** GET /rides/:rideId, as `serializeRideDetail` on the server writes it. */
export type RideDetail = {
  id: string;
  /** "WH-01234"; null on rides from before trip numbers. */
  tripId: string | null;
  status: string;
  riderId: string;
  driverId: string | null;
  paymentMethod: string | null;
  pickup: { lat: number; lng: number; address: string };
  destination: { lat: number; lng: number; address: string };
  stops: RideDetailStop[];
  fareEstimateNgn: number | null;
  riderOfferNgn: number | null;
  agreedFareNgn: number | null;
  fareFinalNgn: number | null;
  platformFeeNgn: number | null;
  pricingVersion: string | number | null;
  penaltyNgn: number | null;
  distanceKm: number | null;
  durationSeconds: number | null;
  cancelStage: string | null;
  cancelReason: string | null;
  matchedAt: string | null;
  arrivedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  driver: {
    id: string;
    userId: string;
    name: string | null;
    phone: string | null;
    rating: number | null;
    status: string;
    vehicleMake: string | null;
    vehicleModel: string | null;
    vehiclePlate: string | null;
    vehicleYear: number | null;
  } | null;
};

export async function getRide(input: { accessToken: string; rideId: string }): Promise<RideDetail> {
  const response = await apiRequest<{ ride: RideDetail }>(
    "GET",
    `/rides/${encodeURIComponent(input.rideId)}`,
    { accessToken: input.accessToken, fallbackError: "Could not load this trip." },
  );
  return response.ride;
}

export function useRide(rideId: string | null): {
  ride: RideDetail | null;
  isLoading: boolean;
  error: string | null;
  reload: () => Promise<void>;
} {
  const { getAccessToken, isReady, user } = useAuth();
  const [ride, setRide] = useState<RideDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);

  const reload = useCallback(async (): Promise<void> => {
    if (!isReady) return;
    const call = ++latest.current;
    if (!rideId || !user || !isBackendConfigured()) {
      setRide(null);
      setError("Could not load this trip.");
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const accessToken = await getAccessTokenWithRetry(getAccessToken);
      if (!accessToken) throw new Error("Could not load this trip. Please sign in again.");
      const next = await getRide({ accessToken, rideId });
      if (call !== latest.current) return;
      setRide(next);
    } catch (loadError) {
      if (call !== latest.current) return;
      setError(loadError instanceof Error ? loadError.message : "Could not load this trip.");
    } finally {
      if (call === latest.current) setIsLoading(false);
    }
  }, [getAccessToken, isReady, rideId, user]);

  useEffect(() => {
    void reload();
    return () => {
      latest.current += 1;
    };
  }, [reload]);

  return { ride, isLoading, error, reload };
}

/* ── the list ──────────────────────────────────────────────────────────── */

export type RiderTrip = RiderHistoryRide;

/** When a past ride ended, for sorting and for its date line. */
export function tripEndedAt(trip: Pick<RiderTrip, "completedAt" | "cancelledAt" | "createdAt">): string {
  return trip.completedAt ?? trip.cancelledAt ?? trip.createdAt;
}

/** What the rider paid for a finished ride, or null when the server has no figure. */
export function tripPaidNgn(trip: Pick<RiderTrip, "fareFinalNgn" | "fareEstimateNgn">): number | null {
  const amount = trip.fareFinalNgn ?? trip.fareEstimateNgn;
  return typeof amount === "number" && Number.isFinite(amount) ? amount : null;
}

// Trips is a tab and stays mounted; the list is kept between visits and
// fetched again once it is this old.
const TRIPS_FRESH_MS = 30_000;
let cachedTrips: RiderTrip[] = [];
let cachedTripsAt = 0;

/** Forget the kept list: the next person to sign in must not see this one's rides. */
export function clearRiderTripsCache(): void {
  cachedTrips = [];
  cachedTripsAt = 0;
}

export function useRiderTrips(limit = 30): {
  trips: RiderTrip[];
  isLoading: boolean;
  error: string | null;
  /** Fetch again. Without `force`, a list fetched in the last 30 seconds is kept. */
  refresh: (options?: { force?: boolean }) => Promise<void>;
} {
  const { getAccessToken, isReady, user } = useAuth();
  const signedIn = user !== null;
  const [trips, setTrips] = useState<RiderTrip[]>(() => cachedTrips.slice(0, limit));
  const [isLoading, setIsLoading] = useState(() => isBackendConfigured() && trips.length === 0);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);

  const refresh = useCallback(
    async (options?: { force?: boolean }): Promise<void> => {
      if (!isReady) return;
      const call = ++latest.current;
      // Signed out: the next rider must not see this one's rides.
      if (!isBackendConfigured() || !signedIn) {
        cachedTrips = [];
        cachedTripsAt = 0;
        setTrips([]);
        setIsLoading(false);
        return;
      }
      if (!options?.force && cachedTripsAt > 0 && Date.now() - cachedTripsAt < TRIPS_FRESH_MS) {
        setTrips(cachedTrips.slice(0, limit));
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      setError(null);
      try {
        const accessToken = await getAccessTokenWithRetry(getAccessToken);
        if (!accessToken) throw new Error("Could not load your trips. Please sign in again.");
        const response = await getRiderRideHistory({ accessToken, limit });
        cachedTrips = response.items;
        cachedTripsAt = Date.now();
        if (call === latest.current) setTrips(response.items.slice(0, limit));
      } catch (loadError) {
        // Whatever was already on screen stays there.
        if (call === latest.current) {
          setError(loadError instanceof Error ? loadError.message : "Could not load your trips.");
        }
      } finally {
        if (call === latest.current) setIsLoading(false);
      }
    },
    [getAccessToken, isReady, limit, signedIn],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { trips, isLoading, error, refresh };
}

/* ── booking a past ride again ─────────────────────────────────────────── */

/**
 * The `/ride-selection` params for a past ride, the same way round or
 * reversed. Null when an address is missing. `via` are the stops in between,
 * in the order they were made.
 */
export function rebookParams(
  trip: { pickupAddress: string | null | undefined; destAddress: string | null | undefined; via?: string[] },
  direction: "same" | "reverse" = "same",
): { itinerary: string; source: "history" } | null {
  const pickup = trip.pickupAddress?.trim() ?? "";
  const destination = trip.destAddress?.trim() ?? "";
  if (!pickup || !destination) return null;
  const via = (trip.via ?? []).map((stop) => stop.trim()).filter((stop) => stop.length > 0);
  const itinerary =
    direction === "same"
      ? { pickup, stops: [...via, destination] }
      : { pickup: destination, stops: [...via.reverse(), pickup] };
  return { itinerary: serializeRideItinerary(itinerary), source: "history" };
}

/**
 * True once a list that starts out "not loading and empty" has finished a
 * load, so a screen can tell "nothing yet" from "nothing there".
 */
export function useHasLoaded(isLoading: boolean): boolean {
  const [started, setStarted] = useState(isLoading);
  useEffect(() => {
    if (isLoading) setStarted(true);
  }, [isLoading]);
  return !isBackendConfigured() || (started && !isLoading);
}
