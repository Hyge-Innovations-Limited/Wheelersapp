/**
 * The rider's finished rides, as the server has them: the list behind Trips
 * and the one ride behind a receipt.
 *
 * `lib/rider-history.ts` gives ready-made list text; these screens need the
 * addresses, amounts and dates themselves (to book a ride again, to show a
 * cancelled ride differently), so this reads the same endpoint unshaped.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  apiRequest,
  getRiderRideHistory,
  isBackendConfigured,
  type RiderHistoryRide,
} from "@/lib/api";
import { invalidateCached, useCachedQuery } from "@/lib/cached-query";
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

/**
 * A trip's receipt, kept on the phone: a completed or cancelled ride does not change, so it opens at once, with no
 * connection too, and is not fetched again unless the rider pulls to refresh. A trip still going is fetched again
 * after 15 seconds.
 */
const isFinished = (ride: RideDetail) => ride.status === "COMPLETED" || ride.status === "CANCELLED";

export function useRide(rideId: string | null): {
  ride: RideDetail | null;
  isLoading: boolean;
  error: string | null;
  /** Fetch again. Without `force`, a finished trip already kept is left as it is. */
  reload: (options?: { force?: boolean }) => Promise<void>;
} {
  const [finished, setFinished] = useState(false);
  const query = useCachedQuery<RideDetail>({
    key: `trips.ride.${rideId ?? "none"}`,
    fetcher: (accessToken) => getRide({ accessToken, rideId: rideId ?? "" }),
    staleMs: finished ? Number.POSITIVE_INFINITY : 15_000,
    enabled: Boolean(rideId) && isBackendConfigured(),
  });
  const ride = query.data;
  useEffect(() => {
    setFinished(Boolean(ride && isFinished(ride)));
  }, [ride]);
  const { refresh } = query;
  const reload = useCallback(async (options?: { force?: boolean }) => {
    if (options?.force || !ride || !isFinished(ride)) await refresh();
  }, [refresh, ride]);
  return { ride, isLoading: query.loading, error: rideId ? query.error : "Could not load this trip.", reload };
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

/** Past trips do not change; new ones arrive when a trip ends (the session marks the list stale then). */
const TRIPS_FRESH_MS = 15 * 60_000;
const TRIPS_KEPT = 30;

/** Kept for sign-out: every kept copy goes then (lib/auth clearCachedQueries). */
export function clearRiderTripsCache(): void {
  invalidateCached("trips");
}

/**
 * The rider's past trips: shown at once from the copy on the phone (even with no connection), never a spinner after
 * the first time. Fetched again when a trip ends or is cancelled, when the app has been away a while, and on a pull to
 * refresh, never on every visit.
 */
export function useRiderTrips(limit = 30): {
  trips: RiderTrip[];
  isLoading: boolean;
  error: string | null;
  /** With `force` (a pull to refresh): fetch now. Without: the kept copy stays unless it is old or stale. */
  refresh: (options?: { force?: boolean }) => Promise<void>;
} {
  const query = useCachedQuery<RiderTrip[]>({
    key: "trips.past",
    fetcher: (accessToken) => getRiderRideHistory({ accessToken, limit: TRIPS_KEPT }).then((r) => r.items),
    staleMs: TRIPS_FRESH_MS,
    enabled: isBackendConfigured(),
  });
  const trips = useMemo(() => (query.data ?? []).slice(0, limit), [query.data, limit]);
  const { refresh: fetchNow } = query;
  const refresh = useCallback(async (options?: { force?: boolean }) => {
    if (options?.force) await fetchNow();
  }, [fetchNow]);
  return { trips, isLoading: query.loading, error: query.error, refresh };
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
 * True once there is something to show (a copy kept on the phone, or the first answer), so a screen can tell
 * "nothing yet" from "nothing there". The lists read from the kept copy are loading only while they have nothing.
 */
export function useHasLoaded(isLoading: boolean): boolean {
  return !isBackendConfigured() || !isLoading;
}
