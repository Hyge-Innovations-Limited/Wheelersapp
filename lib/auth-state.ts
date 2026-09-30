import * as SecureStore from "expo-secure-store";

import { clearCachedAccessToken, clearStoredLocalAccessToken } from "@/lib/access-token";
import { clearDriverKyc } from "@/lib/driver-kyc-store";

export type AppAuthRole = "RIDER" | "DRIVER";
export type RiderOnboardingRoute = "/rider";
export type AuthenticatedRoute = "/driver/(tabs)/home" | RiderOnboardingRoute;

/**
 * Signing in IS onboarding for a rider — there is no phone-verification step
 * between the account and the app, so there is no half-finished state to
 * remember either.
 */
export type StoredAuthState = {
  role: AppAuthRole;
  onboardingComplete: boolean;
  onboardingRoute: AuthenticatedRoute;
};

const AUTH_STATE_KEY = "wheelers.auth.state";
const LOGOUT_PENDING_KEY = "wheelers.auth.logout.pending";

export function getPostLoginRoute(role: AppAuthRole): AuthenticatedRoute {
  return role === "DRIVER" ? "/driver/(tabs)/home" : "/rider";
}

export function getAuthenticatedRoute(state: StoredAuthState): AuthenticatedRoute {
  return state.role === "DRIVER" ? "/driver/(tabs)/home" : "/rider";
}

export async function readStoredAuthState(): Promise<StoredAuthState | null> {
  try {
    const raw = await SecureStore.getItemAsync(AUTH_STATE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<StoredAuthState>;
    if (parsed.role !== "RIDER" && parsed.role !== "DRIVER") {
      return null;
    }

    // Anyone stored mid-way through the old phone-verification flow is simply
    // signed in now — that step no longer exists, so it must not strand them.
    const onboardingRoute: AuthenticatedRoute =
      parsed.role === "DRIVER" ? "/driver/(tabs)/home" : "/rider";

    return {
      role: parsed.role,
      onboardingComplete: true,
      onboardingRoute,
    };
  } catch {
    return null;
  }
}

export async function writeStoredAuthState(state: StoredAuthState): Promise<void> {
  await SecureStore.setItemAsync(AUTH_STATE_KEY, JSON.stringify(state));
}

export async function persistAuthenticatedRole(
  role: AppAuthRole,
): Promise<StoredAuthState> {
  const nextState: StoredAuthState = {
    role,
    onboardingComplete: true,
    onboardingRoute: role === "DRIVER" ? "/driver/(tabs)/home" : "/rider",
  };

  await writeStoredAuthState(nextState);
  await clearLogoutPending();
  return nextState;
}

export async function markStoredOnboardingComplete(): Promise<StoredAuthState | null> {
  const currentState = await readStoredAuthState();
  if (!currentState) {
    return null;
  }

  const nextState: StoredAuthState = { ...currentState, onboardingComplete: true };
  await writeStoredAuthState(nextState);
  return nextState;
}


export async function clearStoredAuthState(): Promise<void> {
  clearCachedAccessToken();
  await clearStoredLocalAccessToken();
  await clearDriverKyc();
  await SecureStore.deleteItemAsync(AUTH_STATE_KEY);
}

export async function markLogoutPending(): Promise<void> {
  await SecureStore.setItemAsync(LOGOUT_PENDING_KEY, "1");
}

export async function readLogoutPending(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(LOGOUT_PENDING_KEY)) === "1";
  } catch {
    return false;
  }
}

export async function clearLogoutPending(): Promise<void> {
  await SecureStore.deleteItemAsync(LOGOUT_PENDING_KEY);
}
