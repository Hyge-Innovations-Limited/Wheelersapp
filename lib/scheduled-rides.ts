import { useAuth } from "@/lib/auth";
import { useCallback, useMemo } from "react";

import { invalidateCached, patchCached, useCachedQuery } from "@/lib/cached-query";

import { getAccessTokenWithRetry } from "@/lib/access-token";
import type { TripDetails } from "@/lib/trip-details";
import {
  cancelScheduledRide,
  createScheduledRide,
  getScheduledRides,
  isBackendConfigured,
  type RideEstimateWaypoint,
  type ScheduledRide,
} from "@/lib/api";

export type ScheduledRideListItem = {
  id: string;
  title: string;
  meta: string;
  fare: string;
  statusLabel: string;
  icon: string;
  scheduledFor: string;
};

function shortenAddress(value: string): string {
  const [firstSegment] = value.split(",");
  const trimmed = firstSegment?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : value;
}

function formatScheduledWhen(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Scheduled ride";
  }

  const dayLabel = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);

  const timeLabel = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);

  return `${dayLabel}, ${timeLabel}`;
}

function formatFare(ride: ScheduledRide): string {
  return typeof ride.fareEstimateNgn === "number"
    ? `NGN ${Math.round(ride.fareEstimateNgn).toLocaleString("en-NG")}`
    : "Fare pending";
}

function mapStatusLabel(ride: ScheduledRide): string {
  switch (ride.status) {
    case "DISPATCHING":
      return "Starting soon";
    case "DISPATCHED":
      return "Live request sent";
    case "CANCELLED":
      return "Cancelled";
    case "EXPIRED":
      return "Expired";
    default:
      return "Scheduled";
  }
}

function mapScheduledRideItem(ride: ScheduledRide): ScheduledRideListItem {
  return {
    id: ride.id,
    title: `${shortenAddress(ride.pickupAddress)} to ${shortenAddress(ride.destAddress)}`,
    meta: formatScheduledWhen(ride.scheduledFor),
    fare: formatFare(ride),
    statusLabel: mapStatusLabel(ride),
    icon: "calendar-today",
    scheduledFor: ride.scheduledFor,
  };
}

/** Upcoming rides: changed by the rider (book, cancel) or when one starts, so fetched again every few minutes. */
const UPCOMING_FRESH_MS = 5 * 60_000;
const UPCOMING_KEPT = 30;

/**
 * The rider's rides booked for later: shown at once from the copy on the phone (even with no connection), fetched
 * again when booked or cancelled here, every few minutes, and on a pull to refresh.
 */
export function useScheduledRides(limit = 20): {
  items: ScheduledRideListItem[];
  rawItems: ScheduledRide[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  cancelItem: (scheduledRideId: string, reason?: string) => Promise<void>;
} {
  const { getAccessToken } = useAuth();
  const query = useCachedQuery<ScheduledRide[]>({
    key: "trips.upcoming",
    fetcher: (accessToken) => getScheduledRides({ accessToken, limit: UPCOMING_KEPT }).then((r) => r.items),
    staleMs: UPCOMING_FRESH_MS,
    enabled: isBackendConfigured(),
  });
  const rawItems = useMemo(() => (query.data ?? []).slice(0, limit), [query.data, limit]);
  const items = useMemo(() => rawItems.map(mapScheduledRideItem), [rawItems]);
  const { refresh } = query;

  const cancelItem = useCallback(async (scheduledRideId: string, reason?: string): Promise<void> => {
    const accessToken = await getAccessTokenWithRetry(getAccessToken);
    if (!accessToken) {
      throw new Error("Could not get an access token to cancel this ride.");
    }
    await cancelScheduledRide({ accessToken, scheduledRideId, reason });
    // Gone from the list at once; the server's list follows.
    patchCached("trips.upcoming", (data) => (Array.isArray(data) ? (data as ScheduledRide[]).filter((r) => r.id !== scheduledRideId) : null));
    await refresh();
  }, [getAccessToken, refresh]);

  return {
    items,
    rawItems,
    isLoading: query.loading,
    error: query.error,
    refresh: useCallback(() => refresh(), [refresh]),
    cancelItem,
  };
}

export async function submitScheduledRide(params: {
  getAccessToken: () => Promise<string | null | undefined>;
  scheduledFor: string;
  idempotencyKey?: string;
  pickup: RideEstimateWaypoint;
  destination: RideEstimateWaypoint;
  stops?: RideEstimateWaypoint[];
  /** People, luggage, pet and a note, for its search. Older servers ignore it. */
  tripDetails?: TripDetails;
}): Promise<ScheduledRide> {
  const accessToken = await getAccessTokenWithRetry(params.getAccessToken);
  if (!accessToken) {
    throw new Error("Could not get an access token to schedule this ride.");
  }

  const response = await createScheduledRide({
    accessToken,
    scheduledFor: params.scheduledFor,
    idempotencyKey: params.idempotencyKey,
    pickup: params.pickup,
    destination: params.destination,
    stops: params.stops ?? [],
    ...(params.tripDetails ? { tripDetails: params.tripDetails } : {}),
  });

  invalidateCached("trips.upcoming");
  return response.item;
}
