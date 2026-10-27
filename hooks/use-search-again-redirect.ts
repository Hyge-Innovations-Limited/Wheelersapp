import { useIsFocused } from "@react-navigation/native";
import { useRouter, type Href } from "expo-router";
import { useEffect } from "react";

import { useRideSession } from "@/lib/ride-session";
import { searchAgainRoute } from "@/lib/search-again-route";

/**
 * The booked driver pulled out and the search goes on (the ride is back to
 * 'bidding'): leave this trip screen for Finding drivers. Only while this
 * screen is in front.
 *
 * - "replace": a trip screen (Driver found, the trip) is replaced by Finding drivers.
 * - "back": a screen opened over the trip screen (chat, change a stop) goes
 *   back to it, and the trip screen moves on; with nothing behind it, it is
 *   replaced by Finding drivers.
 *
 * Only for screens that exist while a driver is booked: 'bidding' anywhere
 * else is an ordinary search.
 */
export function useSearchAgainRedirect(mode: "replace" | "back", enabled = true): boolean {
  const { currentRide } = useRideSession();
  const router = useRouter();
  const isFocused = useIsFocused();
  const route = enabled ? searchAgainRoute(currentRide) : null;
  const key = route ? `${route.params.itinerary}|${route.params.offer ?? ""}` : null;

  useEffect(() => {
    if (!isFocused || !route) return;
    if (mode === "back" && router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(route as Href);
    // The route object is rebuilt every render; its key says when it changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused, key, mode, router]);

  return route !== null;
}
