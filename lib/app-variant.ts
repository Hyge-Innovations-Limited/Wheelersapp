import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";

export type AppVariant = "rider" | "driver";
export type VariantPublicRoute = "/welcome" | "/rider-auth" | "/account-auth" | "/driver-auth";

const configuredVariant =
  process.env.EXPO_PUBLIC_APP_VARIANT ??
  Constants.expoConfig?.extra?.appVariant;

const MODE_KEY = "wheelers.app.mode";

/** Built as the driver-only app. It has one side and never switches. */
const builtAsDriver = configuredVariant === "driver";

/**
 * The Wheelers app carries both sides: a person picks Ride or Drive after the
 * splash, and the choice is remembered. It is read once, as the app starts,
 * so everything that asks `isDriverApp` gets one answer for the whole run;
 * changing sides restarts the app's JavaScript (see `switchAppSide`).
 */
function rememberedSide(): AppVariant | null {
  if (builtAsDriver) return null;
  try {
    return SecureStore.getItem(MODE_KEY) === "driver" ? "driver" : null;
  } catch {
    return null;
  }
}

export const appVariant: AppVariant =
  builtAsDriver || rememberedSide() === "driver" ? "driver" : "rider";

export const isDriverApp = appVariant === "driver";

/** True in the one app that offers both Ride and Drive. */
export const offersBothSides = !builtAsDriver;

export const appDisplayName = builtAsDriver ? "Wheelers Driver" : "Wheelers";

export const targetAuthRole = isDriverApp ? "DRIVER" : "RIDER";

// Signed out, a rider starts at the welcome screen (then Ride or Drive, then
// their phone number); a driver starts at driver sign-in.
export const publicEntryRoute: VariantPublicRoute = isDriverApp
  ? "/driver-auth"
  : "/welcome";

export function isRoleAllowedInVariant(role: "RIDER" | "DRIVER" | "BOTH"): boolean {
  if (role === "BOTH") {
    return true;
  }

  return role === targetAuthRole;
}

/**
 * Move to the other side of the app. Returns false when already there (the
 * caller just navigates). Otherwise the choice is saved and the app restarts
 * on that side, which is the only way every provider agrees on who is using
 * it.
 */
export async function switchAppSide(side: AppVariant): Promise<boolean> {
  if (builtAsDriver || side === appVariant) return false;

  if (side === "driver") {
    await SecureStore.setItemAsync(MODE_KEY, "driver");
  } else {
    await SecureStore.deleteItemAsync(MODE_KEY);
  }

  try {
    const Updates = await import("expo-updates");
    await Updates.reloadAsync();
  } catch {
    // Development builds cannot reload through expo-updates.
    const { DevSettings } = await import("react-native");
    DevSettings.reload();
  }
  return true;
}
