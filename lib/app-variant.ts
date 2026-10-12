import * as SecureStore from "expo-secure-store";

export type AppVariant = "rider" | "driver";
export type VariantPublicRoute = "/welcome" | "/rider-auth" | "/account-auth" | "/driver-auth";

const MODE_KEY = "wheelers.app.mode";

/**
 * Wheelers is one app for riders and drivers. It ships as the app that used
 * to be Wheelers Driver (same store listing, same bundle and package), so a
 * driver who updates keeps their install and their login; the build's variant
 * names that identity and no longer decides which side a person is on.
 *
 * A person picks Ride or Drive after the splash, and the choice is
 * remembered. It is read once, as the app starts, so everything that asks
 * `isDriverApp` gets one answer for the whole run; changing sides restarts
 * the app's JavaScript (see `switchAppSide`).
 */
function rememberedSide(): AppVariant | null {
  try {
    return SecureStore.getItem(MODE_KEY) === "driver" ? "driver" : null;
  } catch {
    return null;
  }
}

export const appVariant: AppVariant = rememberedSide() === "driver" ? "driver" : "rider";

export const isDriverApp = appVariant === "driver";

/** Every build offers both Ride and Drive. Kept as a name the screens can ask. */
export const offersBothSides = true;

export const appDisplayName = "Wheelers";

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
  if (side === appVariant) return false;

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
