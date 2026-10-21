/**
 * Ride requests over other apps (Android): a driver who is online with
 * WhatsApp or Maps in front still sees a new request, as a card at the top of
 * the screen with Accept and Ignore (modules/ride-overlay).
 *
 * The driver allows "Display over other apps" once in Android's settings;
 * without it, and on iPhones and builds made before the card existed,
 * everything here does nothing.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { requireOptionalNativeModule } from "expo";
import { useEffect, useState } from "react";
import { Alert, AppState, Platform } from "react-native";

import type { RideOffer } from "@/lib/driver-session-reducer";

export type OverlayAction = { action: "open" | "accept"; rideId: string };

type RideRequestCard = {
  rideId: string;
  heading: string;
  fare: string;
  detail: string;
  pickup: string;
  dropoff: string;
  acceptLabel: string;
  showForMs: number;
};

type NativeOverlay = {
  canShow(): boolean;
  openSettings(): void;
  show(card: RideRequestCard): boolean;
  hide(rideId: string | null): void;
  takePendingAction(): { action?: string; rideId?: string } | null;
  /** The Wheelers bubble (builds made before it have none of these). */
  showBubble?(onTrip: boolean): boolean;
  hideBubble?(): void;
  pulseBubble?(): void;
  resetBubble?(): void;
  addListener(event: "onAction", listener: (event: { action?: string; rideId?: string }) => void): { remove(): void };
};

let native: NativeOverlay | null | undefined;

function overlay(): NativeOverlay | null {
  if (native === undefined) {
    try {
      native = Platform.OS === "android" ? requireOptionalNativeModule<NativeOverlay>("WheelersRideOverlay") : null;
    } catch {
      native = null;
    }
  }
  return native ?? null;
}

/** This phone and build can show the card (whether or not it is allowed yet). */
export function rideOverlaySupported(): boolean {
  return overlay() !== null;
}

/** The driver has allowed Wheelers to display over other apps. */
export function rideOverlayAllowed(): boolean {
  try {
    return overlay()?.canShow() ?? false;
  } catch {
    return false;
  }
}

/** Android's own page for "Display over other apps", on Wheelers. */
export function openRideOverlaySettings(): void {
  try {
    overlay()?.openSettings();
  } catch {
    // Nothing to open on this phone.
  }
}

const naira = (amount: number) => `₦${Math.round(amount).toLocaleString("en-NG")}`;

function kmText(km: number | undefined): string | null {
  if (km === undefined || !Number.isFinite(km)) return null;
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

/** The card for one request: the rider's price on Accept, as on the request screen. */
export function showRideOverlay(offer: RideOffer, showForMs: number): void {
  const card = overlay();
  if (!card || !offer.rideId || showForMs <= 0) return;
  const price = naira(offer.riderOfferNgn ?? offer.fareEstimateNgn);
  const away = kmText(offer.pickupDistanceKm);
  const trip = kmText(offer.plannedDistanceKm);
  const detail = [away ? `${away} to pickup` : null, trip ? `${trip} trip` : null].filter(Boolean).join(" · ");
  try {
    card.show({
      rideId: offer.rideId,
      heading: offer.isGroupRide ? "New group ride request" : offer.afterCurrentTrip ? "Next ride, near your drop-off" : "New ride request",
      fare: price,
      detail,
      pickup: offer.pickup.address,
      dropoff: offer.destination.address,
      acceptLabel: `Accept ${price}`,
      showForMs,
    });
  } catch {
    // The request is still in the app.
  }
}

/** Takes the card down: this request's (gone, taken or answered), or any. */
export function hideRideOverlay(rideId?: string): void {
  try {
    overlay()?.hide(rideId ?? null);
  } catch {
    // Nothing showing.
  }
}

function asAction(value: { action?: string; rideId?: string } | null | undefined): OverlayAction | null {
  if (!value?.rideId || (value.action !== "open" && value.action !== "accept")) return null;
  return { action: value.action, rideId: value.rideId };
}

/** What the driver pressed on the card, once: null when nothing is waiting. */
export function takeRideOverlayAction(): OverlayAction | null {
  try {
    return asAction(overlay()?.takePendingAction());
  } catch {
    return null;
  }
}

/** Called when a button on the card is pressed while the app is running. */
export function onRideOverlayAction(listener: () => void): () => void {
  const card = overlay();
  if (!card) return () => undefined;
  try {
    const subscription = card.addListener("onAction", () => listener());
    return () => subscription.remove();
  } catch {
    return () => undefined;
  }
}

/* ── the Wheelers bubble ────────────────────────────────────────────── */

/**
 * The Wheelers bubble (Android): a round Wheelers logo on the side of the
 * screen while an online driver is in another app, one tap back to Wheelers.
 * It can be dragged anywhere and slides back to the nearest side; dragged to
 * the ✕ it hides until the driver next goes online (they stay online). It uses
 * the same "Display over other apps" permission as the request card, and the
 * driver can switch it off in Settings.
 */
const BUBBLE_KEY = "wheelers.driver.bubble.off";

/** This build has the bubble (whether or not it is allowed yet). */
export function rideBubbleSupported(): boolean {
  return typeof overlay()?.showBubble === "function";
}

/** Shown, with the orange ring while a trip is on. Does nothing without the permission or after the ✕. */
export function showRideBubble(onTrip: boolean): void {
  try {
    overlay()?.showBubble?.(onTrip);
  } catch {
    // No bubble on this phone.
  }
}

export function hideRideBubble(): void {
  try {
    overlay()?.hideBubble?.();
  } catch {
    // Nothing showing.
  }
}

/** A request came in while the driver is elsewhere. */
export function pulseRideBubble(): void {
  try {
    overlay()?.pulseBubble?.();
  } catch {
    // Nothing showing.
  }
}

/** A new online session: a bubble dragged to the ✕ may come back. */
export function resetRideBubble(): void {
  try {
    overlay()?.resetBubble?.();
  } catch {
    // Nothing to reset.
  }
}

export async function rideBubbleWanted(): Promise<boolean> {
  return (await AsyncStorage.getItem(BUBBLE_KEY).catch(() => null)) !== "1";
}

/** The Settings row: on unless the driver switched it off (it still needs "Display over other apps"). */
export function useRideBubbleSetting(): { supported: boolean; on: boolean; set: (on: boolean) => void } {
  const [on, setOn] = useState(true);
  useEffect(() => {
    void rideBubbleWanted().then(setOn);
  }, []);
  const set = (next: boolean) => {
    setOn(next);
    void AsyncStorage.setItem(BUBBLE_KEY, next ? "0" : "1").catch(() => undefined);
    if (!next) hideRideBubble();
  };
  return { supported: rideBubbleSupported(), on, set };
}

const ASKED_KEY = "wheelers.driver.overlay.asked";

/**
 * Asked once, when a driver goes online on a phone that could show the card
 * but has not been allowed to: what it is for, then Android's settings page.
 */
export async function offerRideOverlayOnce(): Promise<void> {
  if (!rideOverlaySupported() || rideOverlayAllowed()) return;
  if (await AsyncStorage.getItem(ASKED_KEY).catch(() => "1")) return;
  await AsyncStorage.setItem(ASKED_KEY, "1").catch(() => undefined);
  Alert.alert(
    "See requests over other apps",
    "When you are in WhatsApp or Maps, Wheelers can show a new ride request on top, with Accept. On the next screen, find Wheelers and switch on \"Allow display over other apps\".",
    [
      { text: "Not now", style: "cancel" },
      { text: "Open settings", onPress: openRideOverlaySettings },
    ],
  );
}

/**
 * The Settings row: whether it is allowed, read again whenever the driver
 * comes back from Android's settings. Android owns the switch, so changing it
 * either way opens that page.
 */
export function useRideOverlaySetting(): { supported: boolean; allowed: boolean; change: () => void } {
  const [allowed, setAllowed] = useState(rideOverlayAllowed);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") setAllowed(rideOverlayAllowed());
    });
    return () => subscription.remove();
  }, []);
  return { supported: rideOverlaySupported(), allowed, change: openRideOverlaySettings };
}
