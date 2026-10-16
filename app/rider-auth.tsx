import { Redirect, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";

import { AuthEntryScreen, type AuthProvider } from "@/components/auth-entry";
import { isDriverApp, publicEntryRoute } from "@/lib/app-variant";
import { isBackendConfigured, signInWithApple, signInWithGoogle } from "@/lib/api";
import { storeLocalAccessToken } from "@/lib/access-token";
import {
  getAuthenticatedRoute,
  persistAuthenticatedRole,
  readStoredAuthState,
} from "@/lib/auth-state";
import { useAuth } from "@/lib/auth";
import {
  getGoogleIosClientId,
  getGoogleWebClientId,
  loadGoogleSignin,
} from "@/lib/google-signin";
import { toUserMessage } from "@/lib/error-messages";

/**
 * Where the rider app opens: Apple, Google, or email.
 *
 * Signing in is the whole of onboarding — there is no phone-verification step
 * between creating an account and using the app, so every path here lands
 * directly on the rider home screen.
 */
export default function RiderAuthScreen() {
  const router = useRouter();
  const { isReady, refreshAuthState } = useAuth();
  const [loadingProvider, setLoadingProvider] = useState<AuthProvider | null>(null);
  const hasNavigated = useRef(false);

  // Someone already signed in should never sit on this screen.
  useEffect(() => {
    if (!isReady || hasNavigated.current) return;

    let cancelled = false;
    void (async () => {
      const stored = await readStoredAuthState();
      if (cancelled || hasNavigated.current || !stored) return;
      hasNavigated.current = true;
      router.replace(getAuthenticatedRoute(stored));
    })();

    return () => {
      cancelled = true;
    };
  }, [isReady, router]);

  if (isDriverApp) {
    return <Redirect href={publicEntryRoute} />;
  }

  async function completeSignIn(accessToken: string) {
    await storeLocalAccessToken(accessToken);
    const state = await persistAuthenticatedRole("RIDER");
    await refreshAuthState();
    hasNavigated.current = true;
    router.replace(getAuthenticatedRoute(state));
  }

  function reportFailure(error: unknown, fallback: string) {
    Alert.alert("Sign in failed", toUserMessage(error, fallback));
  }

  async function handleAppleSignIn() {
    if (!isBackendConfigured()) {
      Alert.alert("Not configured", "The Wheelers backend is not configured for this build.");
      return;
    }

    try {
      setLoadingProvider("apple");
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!credential.identityToken) {
        Alert.alert("Error", "Apple did not return an identity token.");
        return;
      }

      // Apple only sends the name on the very first authorisation.
      const name =
        credential.fullName?.givenName || credential.fullName?.familyName
          ? [credential.fullName.givenName, credential.fullName.familyName]
              .filter(Boolean)
              .join(" ")
          : undefined;

      const result = await signInWithApple({ idToken: credential.identityToken, name });
      await completeSignIn(result.accessToken);
    } catch (error: unknown) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ERR_REQUEST_CANCELED"
      ) {
        return; // the rider backed out; not an error worth an alert
      }
      reportFailure(error, "Could not sign in with Apple.");
    } finally {
      setLoadingProvider(null);
    }
  }

  async function handleGoogleSignIn() {
    if (!isBackendConfigured()) {
      Alert.alert("Not configured", "The Wheelers backend is not configured for this build.");
      return;
    }

    try {
      setLoadingProvider("google");

      const GoogleSignin = await loadGoogleSignin();
      if (!GoogleSignin) return;

      const webClientId = getGoogleWebClientId();
      if (!webClientId) return;

      GoogleSignin.configure({
        iosClientId: getGoogleIosClientId(),
        webClientId,
      });

      await GoogleSignin.hasPlayServices();
      const response = await GoogleSignin.signIn();

      const idToken = response.data?.idToken;
      if (!idToken) {
        Alert.alert("Error", "Google did not return an ID token.");
        return;
      }

      const result = await signInWithGoogle({ idToken });
      await completeSignIn(result.accessToken);
    } catch (error: unknown) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error.code === "SIGN_IN_CANCELLED" || error.code === "-5")
      ) {
        return;
      }
      reportFailure(error, "Could not sign in with Google.");
    } finally {
      setLoadingProvider(null);
    }
  }

  return (
    <AuthEntryScreen
      tagline="Ride. Earn. Own a piece."
      loadingProvider={loadingProvider}
      onApple={handleAppleSignIn}
      onGoogle={handleGoogleSignIn}
      onEmailSignUp={() =>
        router.push({ pathname: "/account-auth", params: { mode: "signup" } })
      }
      onEmailSignIn={() =>
        router.push({ pathname: "/account-auth", params: { mode: "signin" } })
      }
    />
  );
}
