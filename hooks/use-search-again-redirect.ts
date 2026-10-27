import { useIsFocused } from "@react-navigation/native";
import { useRouter, type Href } from "expo-router";
import { useEffect, useRef, useState } from "react";

import { useRideSession } from "@/lib/ride-session";
import { isDriverBail, searchAgainRoute } from "@/lib/search-again-route";

/**
 * The booked driver pulled out and the search goes on (the ride went from
 * matched or active back to 'bidding' while this screen was open): leave this
 * trip screen for Finding drivers, once it is in front.
 *
 * - "replace": a trip screen (Driver found, the trip) is replaced by Finding drivers.
 * - "back": a screen opened over the trip screen (chat, change a stop) goes
 *   back to it, and the trip screen moves on; with nothing behind it, it is
 *   replaced by Finding drivers.
 *
 * A screen opened while the ride is still a search (a "Driver found!" push
 * tapped before the app has heard of the booking) does not move: the booking
 * arrives a moment later and the screen shows it.
 */
export function useSearchAgainRedirect(mode: "replace" | "back", enabled = true): boolean {
  const { currentRide } = useRideSession();
  const router = useRouter();
  const isFocused = useIsFocused();
  const status = currentRide?.status;
  const previousStatusRef = useRef(status);
  const [bailed, setBailed] = useState(false);

  useEffect(() => {
    const previous = previousStatusRef.current;
    previousStatusRef.current = status;
    if (status !== "bidding") setBailed(false);
    else if (isDriverBail(previous, status)) setBailed(true);
  }, [status]);

  const route = enabled && bailed ? searchAgainRoute(currentRide) : null;
  const key = route ? `${route.params.itinerary}|${route.params.offer ?? ""}` : null;

  useEffect(() => {
    if (!isFocused || !route) return;
    setBailed(false);
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
