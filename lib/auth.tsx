import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

import {
  clearStoredLocalAccessToken,
  getStoredLocalAccessToken,
  type AccessTokenGetter,
} from "@/lib/access-token";
import { logoutAccount } from "@/lib/api";
import { stopDriverLivenessUpdates } from "@/lib/background-location";
import { disableStandby } from "@/lib/standby-location";
import { clearStoredAuthState } from "@/lib/auth-state";

interface AuthContextValue {
  /** Returns the locally stored access token, or null. */
  getAccessToken: AccessTokenGetter;
  /** True once the initial token check has completed. */
  isReady: boolean;
  /** Non-null when there is a stored access token (lightweight sentinel). */
  user: { authenticated: true } | null;
  /** Clears the local token and auth state. */
  logout: () => Promise<void>;
  /** Call after storing a new token to update auth state. */
  refreshAuthState: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [isReady, setIsReady] = useState(false);
  const [hasToken, setHasToken] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const token = await getStoredLocalAccessToken();
      if (!cancelled) {
        setHasToken(Boolean(token));
        setIsReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const getAccessToken: AccessTokenGetter = useCallback(async () => {
    return getStoredLocalAccessToken();
  }, []);

  const refreshAuthState = useCallback(async () => {
    const token = await getStoredLocalAccessToken();
    setHasToken(Boolean(token));
  }, []);

  const logout = useCallback(async () => {
    // Location first: a signed-out phone must not keep reporting where it is.
    await Promise.all([stopDriverLivenessUpdates(), disableStandby()]).catch(() => undefined);
    // Tell the backend to blacklist this token
    try {
      const token = await getStoredLocalAccessToken();
      if (token) {
        await logoutAccount({ accessToken: token });
      }
    } catch {
      // Still clear local state even if backend call fails
    }
    await clearStoredLocalAccessToken();
    await clearStoredAuthState();
    setHasToken(false);
  }, []);

  const user = useMemo(
    () => (hasToken ? { authenticated: true as const } : null),
    [hasToken],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ getAccessToken, isReady, user, logout, refreshAuthState }),
    [getAccessToken, isReady, user, logout, refreshAuthState],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
