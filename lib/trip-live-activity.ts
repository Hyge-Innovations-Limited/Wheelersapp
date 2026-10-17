/**
 * The trip on the lock screen and in the Dynamic Island (iPhone, iOS 16.2+):
 * "Tolu is on the way · 4:12", "Heading to Lekki", for the rider; "Pick up
 * Ada", "Drop off at Yaba", for the driver. A Live Activity, drawn by the
 * widget expo-live-activity adds to the app.
 *
 * The countdown runs by itself on the phone, so it stays right while the app
 * sleeps; the words change when the app hears the trip move on. Loaded with
 * care: builds made before it, Android, and phones with Live Activities
 * switched off simply never show it.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { requireOptionalNativeModule } from "expo";
import * as LiveActivity from "expo-live-activity";
import { Platform } from "react-native";

export type TripCard = {
  /** The ride: a new ride is a new activity. */
  rideId: string;
  title: string;
  subtitle?: string;
  /** When the countdown reaches zero (epoch ms). */
  endsAt?: number;
  /** 0 to 1, instead of a countdown. */
  progress?: number;
};


/** Whose card it is: the rider's trip and the driver's trip never take each other's down. */
export type TripCardOwner = "rider" | "driver";

const STORED_KEY = "wheelers.trip-live-activity";
const MARK = "wheelers_mark";
// Ink card, white words, the orange of the app for the bar.
const LOOK: LiveActivity.LiveActivityConfig = {
  backgroundColor: "#1A1410",
  titleColor: "#FFFFFF",
  subtitleColor: "#D9D2C7",
  progressViewTint: "#FF7700",
  progressViewLabelColor: "#FFFFFF",
  timerType: "digital",
  imagePosition: "right",
  imageAlign: "center",
  imageSize: { width: 36, height: 36 },
  contentFit: "contain",
  padding: { horizontal: 20, top: 16, bottom: 16 },
};

let available: boolean | undefined;

/** The native part is in this build (the library's own calls fail without it). */
function supported(): boolean {
  if (available === undefined) {
    try {
      available = Platform.OS === "ios" && requireOptionalNativeModule("ExpoLiveActivity") != null;
    } catch {
      available = false;
    }
  }
  return available;
}

type Current = { id: string; rideId: string; owner: TripCardOwner; shown: string };
let current: Current | null = null;
let restored = false;
let queue: Promise<void> = Promise.resolve();

function stateOf(card: TripCard): LiveActivity.LiveActivityState {
  const progressBar =
    card.progress !== undefined
      ? { progress: Math.min(1, Math.max(0, card.progress)) }
      : card.endsAt !== undefined
        ? { date: Math.max(card.endsAt, Date.now()) }
        : undefined;
  return { title: card.title, subtitle: card.subtitle, progressBar, imageName: MARK, dynamicIslandImageName: MARK };
}

/**
 * What a card looks like, to the minute: a countdown that moved by under a
 * minute is not worth waking the lock screen for.
 */
function fingerprint(card: TripCard): string {
  return JSON.stringify([
    card.title,
    card.subtitle ?? "",
    card.endsAt !== undefined ? Math.round(card.endsAt / 60_000) : null,
    card.progress !== undefined ? Math.round(card.progress * 20) : null,
  ]);
}

async function remember(value: Current | null): Promise<void> {
  current = value;
  if (value) await AsyncStorage.setItem(STORED_KEY, JSON.stringify(value)).catch(() => undefined);
  else await AsyncStorage.removeItem(STORED_KEY).catch(() => undefined);
}

async function apply(owner: TripCardOwner, card: TripCard | null): Promise<void> {
  if (!supported()) return;
  const activities = LiveActivity;
  // One left over from before the app was closed: known again, so it can be ended.
  if (!restored) {
    restored = true;
    const saved = await AsyncStorage.getItem(STORED_KEY).catch(() => null);
    if (saved && !current) {
      try {
        current = JSON.parse(saved) as Current;
      } catch {
        current = null;
      }
    }
  }

  if (!card) {
    if (current && current.owner === owner) {
      try {
        activities.stopActivity(current.id, { title: "Trip ended", imageName: MARK, dynamicIslandImageName: MARK });
      } catch {
        // Already gone (swiped away, or iOS ended it).
      }
      await remember(null);
    }
    return;
  }

  const shown = fingerprint(card);
  if (current && current.rideId === card.rideId && current.owner === owner) {
    if (current.shown === shown) return;
    try {
      activities.updateActivity(current.id, stateOf(card));
      await remember({ ...current, shown });
      return;
    } catch {
      // Swiped away or ended by iOS: a fresh one below.
    }
  }

  if (current) {
    try {
      activities.stopActivity(current.id, stateOf(card));
    } catch {
      // Already gone.
    }
    await remember(null);
  }
  try {
    const id = activities.startActivity(stateOf(card), LOOK);
    if (id) await remember({ id, rideId: card.rideId, owner, shown });
  } catch {
    // Live Activities switched off for Wheelers, or too old an iPhone.
  }
}

/** Shows, updates or (with null) ends this owner's trip card. Calls run in order. */
export function showTripCard(owner: TripCardOwner, card: TripCard | null): void {
  if (!supported()) return;
  queue = queue.then(() => apply(owner, card)).catch(() => undefined);
}

export function firstWord(name: string | null | undefined): string | undefined {
  return name?.trim().split(/\s+/)[0] || undefined;
}

export function shortPlace(address: string | null | undefined): string {
  return (address ?? "").split(",")[0]?.trim() ?? "";
}
