import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { Platform } from "react-native";
import {
  isMockLocationAvailable,
  loadMockLocationPreset,
  saveMockLocationPreset,
  type MockLocationPreset,
} from "@/lib/dev-mock-location";
import {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { BackgroundLocationDisclosure } from "@/components/BackgroundLocationDisclosure";
import { setPlaceSearchBias } from "@/lib/google-places";

/**
 * Persisted marker that the user explicitly tapped "Not now" on the Play
 * prominent-disclosure screen. Automatic (non user-initiated) requests skip the
 * disclosure while this is set so we don't nag on every trip; a user-initiated
 * request can pass `{ force: true }` to show it again.
 */
const BACKGROUND_DISCLOSURE_DECLINED_KEY = "wheelers.backgroundLocation.disclosureDeclined";
const FOREGROUND_DISCLOSURE_DECLINED_KEY = "wheelers.foregroundLocation.disclosureDeclined";
/**
 * iOS: the explainer has no "Not now" (App Review 5.1.1(iv)) — it always goes
 * on to Apple's prompt, and iOS itself remembers the answer. So no "declined
 * before" shortcut there; a denial shows up as the OS permission state.
 */
const DISCLOSURE_CAN_BE_DECLINED = Platform.OS !== "ios";

type AppLocation = {
  lat: number;
  lng: number;
  address: string;
};

type LocationPermissionState = "idle" | "granted" | "denied";

type RequestBackgroundOptions = {
  /**
   * Show the prominent disclosure even if the user previously declined it.
   * Use for explicit user actions (e.g. a settings toggle), never for
   * automatic prompts.
   */
  force?: boolean;
};

type LocationContextValue = {
  permissionState: LocationPermissionState;
  backgroundGranted: boolean;
  currentLocation: AppLocation | null;
  error: string | null;
  requestLocationAccess: () => Promise<void>;
  requestBackgroundLocationAccess: (options?: RequestBackgroundOptions) => Promise<void>;
  refreshLocation: () => Promise<void>;
  /** Dev builds only: the Lagos preset overriding the real GPS, if any. */
  mockLocation: MockLocationPreset | null;
  setMockLocation: (preset: MockLocationPreset | null) => Promise<void>;
};

const defaultValue: LocationContextValue = {
  permissionState: "idle",
  backgroundGranted: false,
  currentLocation: null,
  error: null,
  requestLocationAccess: async () => undefined,
  requestBackgroundLocationAccess: async () => undefined,
  refreshLocation: async () => undefined,
  mockLocation: null,
  setMockLocation: async () => undefined,
};

const LocationContext = createContext<LocationContextValue>(defaultValue);

function formatAddress(parts: Location.LocationGeocodedAddress[]): string | null {
  const first = parts[0];
  if (!first) {
    return null;
  }

  return [
    first.name,
    first.street,
    first.district,
    first.city,
    first.region,
  ]
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .filter((part, index, list) => list.findIndex((item) => item.toLowerCase() === part.toLowerCase()) === index)
    .join(", ");
}

async function resolveAddress(lat: number, lng: number): Promise<string> {
  try {
    const address = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    return formatAddress(address) ?? `Current location (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
  } catch {
    return `Current location (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
  }
}

export function LocationProvider({ children }: { children: ReactNode }) {
  const [permissionState, setPermissionState] = useState<LocationPermissionState>("idle");
  const [backgroundGranted, setBackgroundGranted] = useState(false);
  const [gpsLocation, setGpsLocation] = useState<AppLocation | null>(null);

  // Dev-only fake GPS (see dev-mock-location.ts). When set, it wins over the
  // real position everywhere downstream — matching, the map, pickup distances.
  const [mockLocation, setMockLocationState] = useState<MockLocationPreset | null>(null);
  useEffect(() => {
    if (!isMockLocationAvailable()) return;
    void loadMockLocationPreset().then(setMockLocationState);
  }, []);
  const setMockLocation = useCallback(async (preset: MockLocationPreset | null) => {
    if (!isMockLocationAvailable()) return;
    setMockLocationState(preset);
    await saveMockLocationPreset(preset);
  }, []);

  const currentLocation = useMemo<AppLocation | null>(
    () =>
      mockLocation
        ? { lat: mockLocation.lat, lng: mockLocation.lng, address: mockLocation.address }
        : gpsLocation,
    [mockLocation, gpsLocation],
  );

  // Place search ranks results by distance from the rider. Without this it has
  // no idea where they are and falls back to no bias at all.
  useEffect(() => {
    setPlaceSearchBias(
      currentLocation ? { lat: currentLocation.lat, lng: currentLocation.lng } : null,
    );
  }, [currentLocation]);
  const [error, setError] = useState<string | null>(null);
  const [disclosureVisible, setDisclosureVisible] = useState(false);
  const [disclosureScope, setDisclosureScope] = useState<"foreground" | "background">("background");
  const subscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const disclosureResolverRef = useRef<((accepted: boolean) => void) | null>(null);

  /**
   * Google Play "Prominent Disclosure and Consent" requirement: before the
   * ACCESS_BACKGROUND_LOCATION runtime prompt we must show an in-app screen
   * that explains what is collected, why, and that it happens even when the
   * app is closed, and the user must affirmatively accept it. This resolves
   * `true` only when the user taps "Allow" on that screen.
   */
  const showDisclosure = useCallback((scope: "foreground" | "background"): Promise<boolean> => {
    // If a disclosure is already open, resolve the previous waiter as declined
    // so it never hangs, then hand the modal to the new caller.
    disclosureResolverRef.current?.(false);
    return new Promise<boolean>((resolve) => {
      disclosureResolverRef.current = resolve;
      setDisclosureScope(scope);
      setDisclosureVisible(true);
    });
  }, []);
  const showBackgroundDisclosure = useCallback(
    (): Promise<boolean> => showDisclosure("background"),
    [showDisclosure],
  );

  const settleDisclosure = useCallback((accepted: boolean) => {
    setDisclosureVisible(false);
    const resolve = disclosureResolverRef.current;
    disclosureResolverRef.current = null;
    resolve?.(accepted);
  }, []);

  // Last reverse-geocoded label. Reused while the device hasn't moved far,
  // so the geocoder is called on real movement, not on every 25 m tick —
  // Apple rate-limits it hard, and a hung lookup used to block the position
  // update behind it, freezing the driver's location entirely.
  const lastAddressRef = useRef<{ lat: number; lng: number; address: string } | null>(null);

  const updateCurrentLocation = useCallback(
    async (
      latitude: number,
      longitude: number,
      providedAddress?: string | null,
    ) => {
      const cached = lastAddressRef.current;
      const nearCache =
        cached &&
        Math.abs(cached.lat - latitude) < 0.003 &&
        Math.abs(cached.lng - longitude) < 0.003;

      // Coordinates land NOW — matching, the map arrow and GPS pings must
      // never wait on a network geocoder.
      setGpsLocation({
        lat: latitude,
        lng: longitude,
        address: providedAddress ?? cached?.address ?? "",
      });

      if (providedAddress) {
        lastAddressRef.current = { lat: latitude, lng: longitude, address: providedAddress };
        return;
      }
      if (nearCache) return;

      void resolveAddress(latitude, longitude)
        .then((address) => {
          if (!address) return;
          lastAddressRef.current = { lat: latitude, lng: longitude, address };
          // Attach the label only if the fix hasn't moved on meanwhile.
          setGpsLocation((prev) =>
            prev && prev.lat === latitude && prev.lng === longitude
              ? { ...prev, address }
              : prev,
          );
        })
        .catch(() => {});
    },
    [],
  );

  const startWatchingLocation = useCallback(async () => {
    subscriptionRef.current?.remove();
    subscriptionRef.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        distanceInterval: 25,
        timeInterval: 15_000,
      },
      (position) => {
        void updateCurrentLocation(
          position.coords.latitude,
          position.coords.longitude,
        );
      },
    );
  }, [updateCurrentLocation]);

  const refreshLocation = useCallback(async (): Promise<void> => {
    try {
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      await updateCurrentLocation(
        position.coords.latitude,
        position.coords.longitude,
      );
      setError(null);
    } catch (locationError) {
      setError(
        locationError instanceof Error
          ? locationError.message
          : "Could not read your current location.",
      );
    }
  }, [updateCurrentLocation]);

  const requestLocationAccess = useCallback(async (options?: { force?: boolean }): Promise<void> => {
    try {
      const foreground = await Location.getForegroundPermissionsAsync();
      let foregroundResult = foreground;
      if (!foreground.granted) {
        // Play policy: the OS runtime prompt must be IMMEDIATELY preceded by
        // an in-app disclosure with an affirmative action. This used to fire
        // the prompt cold on first mount — the exact reason the app was
        // rejected ("Inadequate Prominent Disclosure").
        if (!options?.force && DISCLOSURE_CAN_BE_DECLINED) {
          const declined = await AsyncStorage.getItem(FOREGROUND_DISCLOSURE_DECLINED_KEY);
          if (declined) {
            setPermissionState("denied");
            setError("Location access is disabled.");
            return;
          }
        }
        if (foreground.canAskAgain) {
          const accepted = await showDisclosure("foreground");
          if (!accepted && DISCLOSURE_CAN_BE_DECLINED) {
            await AsyncStorage.setItem(FOREGROUND_DISCLOSURE_DECLINED_KEY, "1");
            setPermissionState("denied");
            setError("Location access is disabled.");
            return;
          }
          await AsyncStorage.removeItem(FOREGROUND_DISCLOSURE_DECLINED_KEY);
        }
        foregroundResult = await Location.requestForegroundPermissionsAsync();
      }

      if (!foregroundResult.granted) {
        setPermissionState("denied");
        setError("Location access is disabled.");
        return;
      }

      setPermissionState("granted");
      setError(null);
      await refreshLocation();
      await startWatchingLocation();
    } catch (locationError) {
      setPermissionState("denied");
      setError(
        locationError instanceof Error
          ? locationError.message
          : "Could not start location tracking.",
      );
    }
  }, [refreshLocation, showDisclosure, startWatchingLocation]);

  const requestBackgroundLocationAccess = useCallback(
    async (options?: RequestBackgroundOptions): Promise<void> => {
      try {
        const foreground = await Location.getForegroundPermissionsAsync();
        if (!foreground.granted) {
          await requestLocationAccess();
        }

        const refreshedForeground = await Location.getForegroundPermissionsAsync();
        if (!refreshedForeground.granted) {
          setBackgroundGranted(false);
          return;
        }

        const background = await Location.getBackgroundPermissionsAsync();
        if (background.granted) {
          setBackgroundGranted(true);
          return;
        }

        // Nothing more we can do if the OS won't ask again; avoid showing a
        // disclosure that leads nowhere.
        if (!background.canAskAgain) {
          setBackgroundGranted(false);
          return;
        }

        if (!options?.force && DISCLOSURE_CAN_BE_DECLINED) {
          const declined = await AsyncStorage.getItem(BACKGROUND_DISCLOSURE_DECLINED_KEY);
          if (declined) {
            setBackgroundGranted(false);
            return;
          }
        }

        // Prominent disclosure MUST precede the runtime permission prompt.
        const accepted = await showBackgroundDisclosure();
        if (!accepted && DISCLOSURE_CAN_BE_DECLINED) {
          await AsyncStorage.setItem(BACKGROUND_DISCLOSURE_DECLINED_KEY, "1");
          setBackgroundGranted(false);
          return;
        }

        await AsyncStorage.removeItem(BACKGROUND_DISCLOSURE_DECLINED_KEY);
        const backgroundResult = await Location.requestBackgroundPermissionsAsync();
        setBackgroundGranted(backgroundResult.granted);
      } catch (locationError) {
        setBackgroundGranted(false);
        setError(
          locationError instanceof Error
            ? locationError.message
            : "Could not enable background location.",
        );
      }
    },
    [requestLocationAccess, showBackgroundDisclosure],
  );

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const foreground = await Location.getForegroundPermissionsAsync();
        if (!foreground.granted) {
          if (!cancelled) {
            setPermissionState("idle");
            setBackgroundGranted(false);
          }
          return;
        }

        if (!cancelled) {
          setPermissionState("granted");
          setError(null);
        }

        await refreshLocation();

        const background = await Location.getBackgroundPermissionsAsync();
        if (!cancelled) {
          setBackgroundGranted(background.granted);
        }

        await startWatchingLocation();
      } catch (locationError) {
        if (!cancelled) {
          setPermissionState("denied");
          setError(
            locationError instanceof Error
              ? locationError.message
              : "Could not start location tracking.",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      subscriptionRef.current?.remove();
      subscriptionRef.current = null;
      disclosureResolverRef.current?.(false);
      disclosureResolverRef.current = null;
    };
  }, [refreshLocation, startWatchingLocation]);

  const value = useMemo<LocationContextValue>(
    () => ({
      permissionState,
      backgroundGranted,
      currentLocation,
      error,
      requestLocationAccess,
      requestBackgroundLocationAccess,
      refreshLocation,
      mockLocation,
      setMockLocation,
    }),
    [
      backgroundGranted,
      currentLocation,
      error,
      permissionState,
      refreshLocation,
      requestBackgroundLocationAccess,
      requestLocationAccess,
      mockLocation,
      setMockLocation,
    ],
  );

  return (
    <LocationContext.Provider value={value}>
      {children}
      <BackgroundLocationDisclosure
        scope={disclosureScope}
        visible={disclosureVisible}
        onAccept={() => settleDisclosure(true)}
        onDecline={() => settleDisclosure(false)}
      />
    </LocationContext.Provider>
  );
}

export function useAppLocation(): LocationContextValue {
  return useContext(LocationContext);
}
