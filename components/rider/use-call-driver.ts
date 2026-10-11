import { useCallback } from "react";
import { Alert, Linking } from "react-native";

import { getRideChatMessages } from "@/lib/api";
import { useCachedQuery } from "@/lib/cached-query";
import { useLiveCall } from "@/lib/live-call/call-session";
import type { RiderRideState } from "@/lib/ride-session";

/**
 * Calling this trip's driver. A call through Wheelers when this build can make
 * one and the server has calls on; otherwise the phone's own dialler, when the
 * server gave us the driver's number.
 */
export function useCallDriver(ride: RiderRideState | null) {
  const { supported, call, startCall } = useLiveCall();
  const rideId = ride?.rideId ?? null;
  const live = ride?.status === "matched" || ride?.status === "active";

  // The same question, and the same kept answer, as the driver side's call button.
  const status = useCachedQuery({
    key: `trip-chat.status.${rideId ?? "none"}`,
    fetcher: (accessToken) => getRideChatMessages({ accessToken, rideId: rideId ?? "", limit: 1 }),
    staleMs: 3 * 60 * 1000,
    storage: "memory",
    enabled: supported && live && Boolean(rideId),
  });

  const inApp = supported && live && Boolean(status.data?.callsEnabled) && status.data?.open !== false;
  const phone = ride?.driver?.driverPhone?.trim() || null;
  const driverName = ride?.driver?.driverName ?? null;
  /** Still asking the server whether calls are on: do not fall back to the dialler yet. */
  const checking = supported && live && status.loading;

  const callDriver = useCallback(() => {
    if (!rideId) return;
    if (inApp) {
      if (call) return;
      void startCall({ rideId, otherName: driverName, otherRole: "DRIVER" });
      return;
    }
    if (!phone) return;
    Linking.openURL(`tel:${phone}`).catch(() => {
      Alert.alert("Could not open the phone app", `Call your driver on ${phone}.`);
    });
  }, [call, driverName, inApp, phone, rideId, startCall]);

  return {
    /** There is a way to call: through the app, or the dialler. */
    canCall: live && !checking && (inApp || Boolean(phone)),
    /** A call is already on. */
    busy: inApp && Boolean(call),
    /** Still finding out whether calls are on. */
    checking,
    inApp,
    callDriver,
  };
}
