import * as Notifications from "expo-notifications";
import { useEffect, useRef, useState } from "react";

import { useDriverSession } from "@/lib/driver-session";
import { estimateEtaMinutes, haversineKm } from "@/lib/geo";
import { useAppLocation } from "@/lib/location";
import { useRideSession, type RiderRideState } from "@/lib/ride-session";
import { firstWord, shortPlace, showTripCard, type TripCard } from "@/lib/trip-live-activity";

const finite = (value: number | undefined | null): value is number => typeof value === "number" && Number.isFinite(value);
const naira = (amount: number) => `₦${Math.round(amount).toLocaleString("en-NG")}`;

/**
 * The rider's trip on the lock screen (lib/trip-live-activity.ts): the search,
 * the driver on the way with a countdown, the driver at the pickup, and the
 * ride itself. Mounted once, under the ride session.
 */
export function RiderTripLiveActivity() {
  const { currentRide } = useRideSession();
  const [arrivedRideId, setArrivedRideId] = useState<string | null>(null);
  // The opening ETA counts down from when it was first heard, not from every re-render.
  const anchorRef = useRef<{ rideId: string; endsAt: number } | null>(null);

  // "Your driver is here" reaches this phone as a push.
  useEffect(() => {
    const subscription = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data as Record<string, unknown> | undefined;
      if (data?.type === "ride:driver_arrived" && typeof data.rideId === "string") setArrivedRideId(data.rideId);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    showTripCard("rider", riderCard(currentRide, arrivedRideId, anchorRef));
  }, [currentRide, arrivedRideId]);

  return null;
}

function riderCard(
  ride: RiderRideState | null,
  arrivedRideId: string | null,
  anchorRef: { current: { rideId: string; endsAt: number } | null },
): TripCard | null {
  if (!ride) return null;
  const { rideId, driver, driverLocation } = ride;
  const name = firstWord(driver?.driverName) ?? "Your driver";
  const car = [driver?.vehicleModel, driver?.vehiclePlate].filter(Boolean).join(" · ") || undefined;
  const destination = shortPlace(ride.itinerary.stops[ride.itinerary.stops.length - 1]) || "your destination";

  if (ride.status === "requesting" || ride.status === "bidding") {
    const offers = ride.offers?.length ?? 0;
    const closes = ride.bidsCloseAt ? Date.parse(ride.bidsCloseAt) : NaN;
    return {
      rideId,
      title: "Finding your driver",
      subtitle: offers > 0 ? `${offers} ${offers === 1 ? "offer" : "offers"} so far. Open Wheelers to choose` : `To ${destination}`,
      endsAt: finite(closes) ? closes : undefined,
    };
  }

  if (ride.status === "matching") {
    return { rideId, title: `Confirming ${name}`, subtitle: car ?? `To ${destination}` };
  }

  if (ride.status === "matched") {
    if (arrivedRideId === rideId) return { rideId, title: `${name} is here`, subtitle: car ?? "At your pickup" };
    let endsAt: number | undefined;
    if (finite(driverLocation?.distanceToNextStopKm)) {
      endsAt = Date.now() + estimateEtaMinutes(driverLocation.distanceToNextStopKm) * 60_000;
    } else if (anchorRef.current?.rideId === rideId) {
      endsAt = anchorRef.current.endsAt;
    } else if (finite(driver?.etaSeconds) && driver.etaSeconds > 0) {
      endsAt = Date.now() + driver.etaSeconds * 1000;
      anchorRef.current = { rideId, endsAt };
    }
    return { rideId, title: `${name} is on the way`, subtitle: car, endsAt };
  }

  if (ride.status === "active") {
    const kmLeft = driverLocation?.distanceToNextStopKm;
    const progress =
      finite(driverLocation?.totalDistanceKm) && finite(ride.plannedDistanceKm) && ride.plannedDistanceKm > 0
        ? driverLocation.totalDistanceKm / ride.plannedDistanceKm
        : undefined;
    const started = ride.startedAt ? Date.parse(ride.startedAt) : NaN;
    const endsAt =
      progress === undefined && finite(started) && finite(ride.plannedDurationSeconds)
        ? started + ride.plannedDurationSeconds * 1000
        : undefined;
    return {
      rideId,
      title: `Heading to ${destination}`,
      subtitle: finite(kmLeft) ? `${kmLeft.toFixed(1)} km to go` : car,
      progress,
      endsAt,
    };
  }

  return null;
}

/**
 * The driver's trip on the lock screen: to the pickup (with a countdown from
 * where the phone is), waiting there, and the drop-off. Mounted once, under
 * the driver session.
 */
export function DriverTripLiveActivity() {
  const { session } = useDriverSession();
  const { currentLocation } = useAppLocation();
  const ride = session.currentRide;
  const status = session.status;
  const here = currentLocation ? { lat: currentLocation.lat, lng: currentLocation.lng } : null;

  let card: TripCard | null = null;
  if (ride) {
    const rider = firstWord(ride.riderName) ?? "your rider";
    const minutesTo = (to: { lat: number; lng: number }) =>
      here ? Date.now() + estimateEtaMinutes(haversineKm(here.lat, here.lng, to.lat, to.lng)) * 60_000 : undefined;
    if (status === "navigating") {
      card = { rideId: ride.rideId, title: `Pick up ${rider}`, subtitle: shortPlace(ride.pickup.address), endsAt: minutesTo(ride.pickup) };
    } else if (status === "arrived") {
      card = { rideId: ride.rideId, title: `Waiting for ${rider}`, subtitle: `At ${shortPlace(ride.pickup.address)}` };
    } else if (status === "active") {
      const paid = ride.paymentMethod?.toUpperCase() === "CASH" ? "Cash" : "Paid in the app";
      card = {
        rideId: ride.rideId,
        title: `Drop off at ${shortPlace(ride.destination.address)}`,
        subtitle: `${naira(ride.completedFareNgn ?? ride.fareNgn)} · ${paid}`,
        endsAt: minutesTo(ride.destination),
      };
    }
  }
  const key = card ? JSON.stringify(card) : "none";

  useEffect(() => {
    showTripCard("driver", card);
    // The card is rebuilt each render; `key` is what it says.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return null;
}
