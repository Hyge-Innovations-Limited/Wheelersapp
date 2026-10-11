import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { AppButton } from "@/components/app-button";
import { AppCard } from "@/components/app-card";
import { AppScreen } from "@/components/app-screen";
import { AppText } from "@/components/app-text";
import { RingStack, StarBurst } from "@/components/decorative-shapes";
import { FlowHeader } from "@/components/flow-header";
import { FloatingView, RevealView } from "@/components/motion";
import { storeLocalAccessToken } from "@/lib/access-token";
import { useAuth } from "@/lib/auth";
import {
  appDisplayName,
  isDriverApp,
  isRoleAllowedInVariant,
  publicEntryRoute,
  targetAuthRole,
} from "@/lib/app-variant";
import {
  isBackendConfigured,
  signinWithUsernamePassword,
  signupWithUsernamePassword,
} from "@/lib/api";
import { persistAuthenticatedRole } from "@/lib/auth-state";
import { resolvePostAuthRoute } from "@/lib/post-auth";
import { getDisplayErrorMessage } from "@/lib/errors";
import { theme } from "@/theme";

type AuthMode = "signup" | "signin";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function normalizeIdentifier(input: string): string {
  const trimmed = input.trim().toLowerCase();
  // An email is sent through untouched — stripping "@" or turning "." into "_"
  // is what made every email address fail validation.
  if (EMAIL_PATTERN.test(trimmed)) {
    return trimmed;
  }

  return trimmed.replace(/^@+/, "").replace(/\s+/g, "_");
}

export default function AccountAuthScreen() {
  const router = useRouter();
  const { refreshAuthState } = useAuth();
  // Sign-in is the ONE front door. Signup lives behind a "Don't have an
  // account?" link (or an explicit ?mode=signup deep link) — a side-by-side
  // tab pair defaulted to signup and walked Google's review bot straight
  // into "email already exists", where it died and failed the whole review.
  const { mode: modeParam } = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<AuthMode>(modeParam === "signup" ? "signup" : "signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function validateCredentials() {
    const identifier = normalizeIdentifier(username);

    if (!identifier) {
      throw new Error("Enter your email address to continue.");
    }

    if (!EMAIL_PATTERN.test(identifier) && !/^[a-z0-9_]{3,24}$/.test(identifier)) {
      throw new Error(
        "That does not look like an email address. Enter your email (name@example.com), or a username of 3-24 letters, numbers or underscores.",
      );
    }

    if (password.length < 8) {
      throw new Error("Your password must be at least 8 characters.");
    }

    if (password.length > 128) {
      throw new Error("Your password must be 128 characters or fewer.");
    }

    return { username: identifier, password };
  }

  async function handleSubmit() {
    if (isSubmitting) {
      return;
    }

    if (!isBackendConfigured()) {
      Alert.alert("Backend not configured", "Set EXPO_PUBLIC_API_BASE_URL before continuing.");
      return;
    }

    let credentials: { username: string; password: string };
    try {
      credentials = validateCredentials();
    } catch (error) {
      Alert.alert(
        mode === "signup" ? "Check your sign-up details" : "Check your sign-in details",
        error instanceof Error ? error.message : "Enter your email and password.",
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const response =
        mode === "signup"
          ? await signupWithUsernamePassword({
              ...credentials,
              // When the identifier is an email, say so explicitly — the
              // backend keeps username and email apart and will not infer one
              // from the other.
              ...(EMAIL_PATTERN.test(credentials.username)
                ? { email: credentials.username }
                : {}),
              role: targetAuthRole,
            })
          : await signinWithUsernamePassword(credentials);

      if (!isRoleAllowedInVariant(response.user.role)) {
        throw new Error(
          isDriverApp
            ? "This account is for the rider app. Use a driver account to continue."
            : "This account is for the driver app. Use a rider account to continue.",
        );
      }

      const authenticatedRole =
        response.user.role === "BOTH" ? targetAuthRole : response.user.role;

      await storeLocalAccessToken(response.accessToken);
      await refreshAuthState();

      const nextState = await persistAuthenticatedRole(authenticatedRole);

      // Drivers are gated on KYC exactly as they are on the social sign-in
      // path — otherwise an email signup lands on the dashboard without ever
      // submitting documents.
      const route = await resolvePostAuthRoute(nextState, response.accessToken);
      router.replace(route);
    } catch (error) {
      const fallback =
        mode === "signup" ? "Could not create your account." : "Could not sign in.";
      Alert.alert(
        mode === "signup" ? "Signup failed" : "Signin failed",
        getDisplayErrorMessage(error, fallback) ?? fallback,
      );
      setIsSubmitting(false);
    }
  }

  if (isSubmitting) {
    return (
      <AppScreen
        backgroundColor={theme.colors.offWhite}
        contentStyle={styles.loadingContainer}
      >
        <FloatingView style={styles.loadingRings} distance={10} rotate={8}>
          <RingStack color="rgba(240,145,63,0.12)" />
        </FloatingView>
        <RevealView delay={40} style={styles.loadingCard}>
          <View style={styles.spinnerWrap}>
            <ActivityIndicator color={theme.colors.orange} size="large" />
          </View>
          <View style={styles.loadingCopy}>
            <AppText variant="h3" style={styles.loadingTitle}>
              {mode === "signup" ? "Creating your account" : "Signing you in"}
            </AppText>
            <AppText variant="bodySmall" color={theme.colors.muted} style={styles.loadingText}>
              {isDriverApp ? "Taking you to your driver dashboard..." : "Taking you into the app..."}
            </AppText>
          </View>
        </RevealView>
      </AppScreen>
    );
  }

  return (
    <AppScreen
      backgroundColor={theme.colors.offWhite}
      scroll
      contentStyle={styles.container}
    >
      <FloatingView style={styles.rings} distance={10} rotate={8}>
        <RingStack color="rgba(240,145,63,0.12)" />
      </FloatingView>
      <FloatingView style={styles.star} delay={200} distance={12} rotate={-12}>
        <StarBurst color="rgba(13,13,13,0.08)" width={46} height={46} />
      </FloatingView>

      <RevealView delay={40} from="down" style={styles.headerWrap}>
        <FlowHeader
          showBack
          backHref={isDriverApp ? undefined : "/rider-auth"}
          overline={isDriverApp ? "WHEELERS DRIVER" : "WHEELERS ACCOUNT"}
          title={
            isDriverApp
              ? mode === "signup"
                ? "Create driver\naccount"
                : "Driver\nsign in"
              : mode === "signup"
                ? "Create your\naccount"
                : "Welcome\nback"
          }
          subtitle={
            isDriverApp
              ? `Use your ${appDisplayName} username and password.`
              : "Use your email and a password, then verify your phone number."
          }
          progress={{ count: 5, active: 2 }}
        />
      </RevealView>

      <RevealView delay={130}>
        <AppCard style={styles.authCard}>
          <AppText variant="h3">{mode === "signup" ? "Create your account" : "Sign in"}</AppText>

          <View style={styles.fieldGroup}>
            <AppText variant="monoSmall" color={theme.colors.muted}>
              EMAIL OR USERNAME
            </AppText>
            <TextInput
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              inputMode="email"
              keyboardType="email-address"
              onChangeText={setUsername}
              placeholder="you@example.com"
              placeholderTextColor={theme.colors.mutedLight}
              selectionColor={theme.colors.orange}
              style={styles.textInput}
              textContentType="emailAddress"
              value={username}
            />
          </View>

          <View style={styles.fieldGroup}>
            <AppText variant="monoSmall" color={theme.colors.muted}>
              PASSWORD
            </AppText>
            <View style={styles.passwordWrap}>
              <TextInput
                autoCapitalize="none"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                autoCorrect={false}
                onChangeText={setPassword}
                placeholder="Minimum 8 characters"
                placeholderTextColor={theme.colors.mutedLight}
                secureTextEntry={!isPasswordVisible}
                selectionColor={theme.colors.orange}
                style={[styles.textInput, styles.passwordInput]}
                textContentType={mode === "signup" ? "newPassword" : "password"}
                value={password}
              />
              <Pressable
                accessibilityLabel={isPasswordVisible ? "Hide password" : "Show password"}
                accessibilityRole="button"
                hitSlop={10}
                onPress={() => setIsPasswordVisible((visible) => !visible)}
                style={styles.eyeButton}
              >
                <Ionicons
                  color={theme.colors.muted}
                  name={isPasswordVisible ? "eye-off-outline" : "eye-outline"}
                  size={20}
                />
              </Pressable>
            </View>
          </View>

          <AppButton
            title={
              isSubmitting
                ? mode === "signup"
                  ? "Creating account..."
                  : "Signing in..."
                : mode === "signup"
                  ? "Continue"
                  : "Sign in"
            }
            disabled={isSubmitting}
            onPress={() => {
              void handleSubmit();
            }}
          />

          <Pressable
            accessibilityRole="button"
            onPress={() => setMode(mode === "signin" ? "signup" : "signin")}
            style={styles.switchLink}
          >
            <AppText variant="bodySmall" color={theme.colors.muted}>
              {mode === "signin" ? "Don't have an account? " : "Already have an account? "}
            </AppText>
            <AppText variant="bodySmall" color={theme.colors.orange}>
              {mode === "signin" ? "Sign up" : "Sign in"}
            </AppText>
          </Pressable>
        </AppCard>
      </RevealView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: { gap: theme.spacing.xl, paddingTop: theme.spacing.lg },
  headerWrap: { marginTop: theme.spacing.sm },
  rings: { position: "absolute", top: -20, right: -32 },
  star: { position: "absolute", bottom: 42, left: 16 },
  authCard: { gap: theme.spacing.md },
  switchLink: {
    flexDirection: "row",
    justifyContent: "center",
    paddingVertical: theme.spacing.xs,
  },
  fieldGroup: {
    gap: theme.spacing.xs,
  },
  passwordWrap: {
    justifyContent: "center",
  },
  passwordInput: {
    // room so the typed password never runs under the eye button
    paddingRight: 52,
  },
  eyeButton: {
    position: "absolute",
    right: theme.spacing.sm,
    height: 44,
    width: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  textInput: {
    minHeight: 52,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.offWhite,
    paddingHorizontal: theme.spacing.md,
    color: theme.colors.black,
    ...theme.typography.body,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    paddingTop: theme.spacing.xl,
  },
  loadingRings: {
    position: "absolute",
    top: 48,
    right: -24,
  },
  loadingCard: {
    alignItems: "center",
    gap: theme.spacing.lg,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.white,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.xl,
    ...theme.shadows.card,
  },
  spinnerWrap: {
    width: 68,
    height: 68,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    borderRadius: 34,
    backgroundColor: theme.colors.orangeLight,
  },
  loadingCopy: {
    gap: theme.spacing.xs,
    alignItems: "center",
  },
  loadingTitle: {
    textAlign: "center",
  },
  loadingText: {
    textAlign: "center",
  },
});
