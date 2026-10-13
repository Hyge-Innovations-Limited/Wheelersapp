import { useState } from "react";
import { useRouter } from "expo-router";
import { Alert } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";

import { AuthEntryScreen, type AuthProvider } from "@/components/auth-entry";
import { signInWithApple, signInWithGoogle } from "@/lib/api";
import { offersBothSides, switchAppSide } from "@/lib/app-variant";
import { DRIVER_TERMS_KEY, afterAccepting, hasAcceptedTerms } from "@/lib/terms-acceptance";
import { storeLocalAccessToken } from "@/lib/access-token";
import { persistAuthenticatedRole } from "@/lib/auth-state";
import { resolvePostAuthRoute } from "@/lib/post-auth";
import { useAuth } from "@/lib/auth";
import {
  getGoogleIosClientId,
  getGoogleWebClientId,
  loadGoogleSignin,
} from "@/lib/google-signin";

export default function DriverAuthScreen() {
  const router = useRouter();
  const { refreshAuthState } = useAuth();
  const [loadingProvider, setLoadingProvider] = useState<AuthProvider | null>(null);

  /**
   * Whatever way a driver chooses to sign in, the terms come first, once on
   * this phone: read, scroll, accept. Accepting carries straight on with the
   * way they chose; after that it goes straight through.
   */
  function afterTerms(carryOn: () => void) {
    void hasAcceptedTerms(DRIVER_TERMS_KEY).then((accepted) => {
      if (accepted) {
        carryOn();
        return;
      }
      // Accepting carries straight on with what they tapped: no second tap.
      afterAccepting(carryOn);
      router.push({ pathname: "/legal", params: { mode: "accept", who: DRIVER_TERMS_KEY } });
    });
  }

  async function handleAppleSignIn() {
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

      const name =
        credential.fullName?.givenName || credential.fullName?.familyName
          ? [credential.fullName.givenName, credential.fullName.familyName]
              .filter(Boolean)
              .join(" ")
          : undefined;

      const result = await signInWithApple({
        idToken: credential.identityToken,
        name,
      });

      await storeLocalAccessToken(result.accessToken);
      const nextState = await persistAuthenticatedRole("DRIVER");
      await refreshAuthState();

      const route = await resolvePostAuthRoute(nextState, result.accessToken);
      router.replace(route);
    } catch (error: unknown) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ERR_REQUEST_CANCELED"
      ) {
        return;
      }

      Alert.alert(
        "Sign in failed",
        error instanceof Error ? error.message : "Could not sign in with Apple.",
      );
    } finally {
      setLoadingProvider(null);
    }
  }

  async function handleGoogleSignIn() {
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

      await storeLocalAccessToken(result.accessToken);
      const nextState = await persistAuthenticatedRole("DRIVER");
      await refreshAuthState();

      const route = await resolvePostAuthRoute(nextState, result.accessToken);
      router.replace(route);
    } catch (error: unknown) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "SIGN_IN_CANCELLED"
      ) {
        return;
      }

      Alert.alert(
        "Sign in failed",
        error instanceof Error ? error.message : "Could not sign in with Google.",
      );
    } finally {
      setLoadingProvider(null);
    }
  }

  return (
    <AuthEntryScreen
      label="DRIVER"
      tagline="Earn on your schedule"
      loadingProvider={loadingProvider}
      onApple={() => afterTerms(() => void handleAppleSignIn())}
      onGoogle={() => afterTerms(() => void handleGoogleSignIn())}
      onEmailSignUp={() =>
        afterTerms(() => router.push({ pathname: "/account-auth", params: { mode: "signup" } }))
      }
      onEmailSignIn={() =>
        afterTerms(() => router.push({ pathname: "/account-auth", params: { mode: "signin" } }))
      }
      onSwitchSide={
        offersBothSides
          ? () =>
              // Switching restarts the app on the rider side. When it is already
              // there (this page was opened some other way), go to the rider's start.
              void switchAppSide("rider").then((switched) => {
                if (!switched) router.replace("/welcome");
              })
          : undefined
      }
    />
  );
}
