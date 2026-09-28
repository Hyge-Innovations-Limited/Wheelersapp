import { useAuth } from "@/lib/auth";
import { useEffect, useState } from "react";

import { getAccessTokenWithRetry } from "@/lib/access-token";
import {
  getRiderRideHistory,
  isBackendConfigured,
  type RiderHistoryRide,
} from "@/lib/api";

export type RiderHistoryListItem = {
  id: string;
  title: string;
  meta: string;
  fare: string;
  statusLabel: string;
  icon: string;
};

type UseRiderHistoryResult = {
  items: RiderHistoryListItem[];
  isLoading: boolean;
  error: string | null;
};

let cachedRiderHistoryItems: RiderHistoryListItem[] = [];

function shortenAddress(value: string): string {
  const [firstSegment] = value.split(",");
  const trimmed = firstSegment?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : value;
}

function formatWhen(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Recent ride";
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTarget = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayDiff = Math.round(
    (startOfToday.getTime() - startOfTarget.getTime()) / (24 * 60 * 60 * 1000),
  );

  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);

  if (dayDiff === 0) {
    return `Today, ${time}`;
  }

  if (dayDiff === 1) {
    return `Yesterday, ${time}`;
  }

  const dayLabel = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
  return `${dayLabel}, ${time}`;
}

function formatFare(ride: RiderHistoryRide): string {
  const fareNgn = ride.fareFinalNgn ?? ride.fareEstimateNgn;
  if (typeof fareNgn === "number" && Number.isFinite(fareNgn)) {
    return `NGN ${Math.round(fareNgn).toLocaleString("en-NG")}`;
  }

  return "Fare pending";
}

function mapIcon(ride: RiderHistoryRide): string {
  if (ride.status === "CANCELLED") {
    return "event-busy";
  }

  return "history";
}

function mapStatusLabel(ride: RiderHistoryRide): string {
  if (ride.status === "CANCELLED") {
    return "Cancelled";
  }

  return "Completed";
}

function mapRideItem(ride: RiderHistoryRide): RiderHistoryListItem {
  return {
    id: ride.id,
    title: `${shortenAddress(ride.pickupAddress)} to ${shortenAddress(ride.destAddress)}`,
    // The trip ID first: what the rider quotes if they need help with this trip.
    meta: [ride.tripId, formatWhen(ride.completedAt ?? ride.cancelledAt ?? ride.createdAt)].filter(Boolean).join(" · "),
    fare: formatFare(ride),
    statusLabel: mapStatusLabel(ride),
    icon: mapIcon(ride),
  };
}

let cachedRiderHistoryAt = 0;
const HISTORY_CACHE_TTL_MS = 30_000;

export function useRiderHistory(limit = 20): UseRiderHistoryResult {
  const { getAccessToken, isReady, user } = useAuth();
  const hasCachedItems = cachedRiderHistoryItems.length > 0;
  const [items, setItems] = useState<RiderHistoryListItem[]>(() =>
    cachedRiderHistoryItems.slice(0, limit),
  );
  const [isLoading, setIsLoading] = useState(() =>
    !hasCachedItems && isBackendConfigured(),
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      if (!isBackendConfigured() || !isReady || !user) {
        if (!cancelled) {
          cachedRiderHistoryItems = [];
          setItems([]);
          setIsLoading(false);
        }
        return;
      }

      // Skip fetch if cache is fresh
      if (
        cachedRiderHistoryItems.length > 0 &&
        Date.now() - cachedRiderHistoryAt < HISTORY_CACHE_TTL_MS
      ) {
        if (!cancelled) {
          setItems(cachedRiderHistoryItems.slice(0, limit));
          setIsLoading(false);
        }
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const accessToken = await getAccessTokenWithRetry(getAccessToken);
        if (!accessToken) {
          throw new Error("Could not get an access token for ride history.");
        }

        const response = await getRiderRideHistory({
          accessToken,
          limit,
        });

        if (!cancelled) {
          const nextItems = response.items.map(mapRideItem);
          cachedRiderHistoryItems = nextItems;
          cachedRiderHistoryAt = Date.now();
          setItems(nextItems.slice(0, limit));
        }
      } catch (loadError) {
        if (!cancelled) {
          // Keep showing cached items on error
          if (cachedRiderHistoryItems.length > 0) {
            setItems(cachedRiderHistoryItems.slice(0, limit));
          }
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load ride history.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [getAccessToken, isReady, limit, user]);

  return {
    items,
    isLoading,
    error,
  };
}

export async function prefetchRiderHistory(
  getAccessToken: () => Promise<string | null | undefined>,
  limit = 3,
): Promise<void> {
  if (!isBackendConfigured()) return;
  if (
    cachedRiderHistoryItems.length > 0 &&
    Date.now() - cachedRiderHistoryAt < HISTORY_CACHE_TTL_MS
  ) {
    return;
  }

  try {
    const accessToken = await getAccessTokenWithRetry(getAccessToken);
    if (!accessToken) return;

    const response = await getRiderRideHistory({ accessToken, limit });
    cachedRiderHistoryItems = response.items.map(mapRideItem);
    cachedRiderHistoryAt = Date.now();
  } catch {
    // Silent — home screen will retry
  }
}
