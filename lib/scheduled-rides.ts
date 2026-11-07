import { useAuth } from "@/lib/auth";
import { useCallback, useEffect, useState } from "react";

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

export function useScheduledRides(limit = 20): {
  items: ScheduledRideListItem[];
  rawItems: ScheduledRide[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  cancelItem: (scheduledRideId: string, reason?: string) => Promise<void>;
} {
  const { getAccessToken, isReady, user } = useAuth();
  const [rawItems, setRawItems] = useState<ScheduledRide[]>([]);
  const [items, setItems] = useState<ScheduledRideListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    if (!isBackendConfigured() || !isReady || !user) {
      setRawItems([]);
      setItems([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const accessToken = await getAccessTokenWithRetry(getAccessToken);
      if (!accessToken) {
        throw new Error("Could not get an access token for scheduled rides.");
      }

      const response = await getScheduledRides({
        accessToken,
        limit,
      });

      setRawItems(response.items);
      setItems(response.items.map(mapScheduledRideItem));
    } catch (loadError) {
      setRawItems([]);
      setItems([]);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load scheduled rides.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [getAccessToken, isReady, limit, user]);

  useEffect(() => {
    void load();
  }, [load]);

  async function cancelItem(
    scheduledRideId: string,
    reason?: string,
  ): Promise<void> {
    const accessToken = await getAccessTokenWithRetry(getAccessToken);
    if (!accessToken) {
      throw new Error("Could not get an access token to cancel this ride.");
    }

    await cancelScheduledRide({
      accessToken,
      scheduledRideId,
      reason,
    });

    await load();
  }

  return {
    items,
    rawItems,
    isLoading,
    error,
    refresh: load,
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

  return response.item;
}
