import { router, useRootNavigationState, usePathname, type Href } from "expo-router";
import { useEffect, useRef } from "react";

import { useAuth } from "@/lib/auth";
import { setRiderPushProbe, riderOnTop, stackActionFor, stackNamesFrom } from "@/lib/push-routing";
import { serializeRideItinerary } from "@/lib/ride-route";
import { useRideSession } from "@/lib/ride-session";

/**
 * Tells the push router which ride is live and which screen shows, so a
 * tapped ride push can open that ride's own screen. Renders nothing.
 */
export function RiderPushBridge() {
  const { currentRide } = useRideSession();
  const pathname = usePathname();
  const rootState = useRootNavigationState();
  const { user } = useAuth();
  const signedIn = Boolean(user);
  const latest = useRef({ currentRide, pathname, signedIn, rootState });
  latest.current = { currentRide, pathname, signedIn, rootState };

  useEffect(() => {
    setRiderPushProbe(() => {
      const { currentRide: ride, pathname: path, signedIn: isIn, rootState: root } = latest.current;
      return {
        pathname: path,
        signedIn: isIn,
        go: (href: string) => {
          // Pop back to the screen when it is already in the stack (its params stay);
          // otherwise push it on top of whatever the rider is on.
          const action = stackActionFor(stackNamesFrom(root), href);
          if (action.kind === 'none') return;
          if (action.kind === 'pop') {
            router.dismiss(action.count);
            if (action.thenNavigate) {
              setTimeout(() => {
                if (riderOnTop(stackNamesFrom(latest.current.rootState))) router.navigate(href as Href);
              }, 60);
            }
            return;
          }
          router.navigate(href as Href);
        },
        ride: ride
          ? {
              rideId: ride.rideId,
              status: ride.status,
              itinerary: serializeRideItinerary(ride.itinerary),
              offerNgn: typeof ride.riderOfferNgn === "number" ? ride.riderOfferNgn : undefined,
            }
          : null,
      };
    });
    return () => setRiderPushProbe(null);
  }, []);

  return null;
}
