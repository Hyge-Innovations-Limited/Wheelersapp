import { openPrivacy, openTerms } from "@/lib/legal-links";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeInDown, ZoomIn } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";

import { AppScreen } from "@/components/app-screen";
import { AppText } from "@/components/app-text";
import { WheelersWordmark } from "@/components/wheelers-wordmark";
import { brand } from "@/constants/brand";
import { theme } from "@/theme";

export type AuthProvider = "apple" | "google";

function GoogleIcon({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <Path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <Path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A11.96 11.96 0 0 0 0 12c0 1.94.46 3.77 1.28 5.4l3.56-2.77.01-.54z" fill="#FBBC05" />
      <Path d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.09 14.97 0 12 0 7.7 0 3.99 2.47 2.18 6.07l3.66 2.84c.87-2.6 3.3-4.16 6.16-4.16z" fill="#EA4335" />
    </Svg>
  );
}

/**
 * Shared sign-in entry screen for both app variants, so rider and driver open
 * on the same branded layout: wordmark, Apple/Google, then an email route.
 *
 * Colours come from the splash palette rather than the orange-led app theme,
 * so the screen reads as a continuation of the artwork the app opened on.
 * Each variant passes its own handlers because what happens after a successful
 * login differs — drivers land in KYC, riders go straight into the app.
 */
export function AuthEntryScreen({
  label,
  tagline,
  loadingProvider,
  onApple,
  onGoogle,
  onEmailSignUp,
  onEmailSignIn,
  onSwitchSide,
  switchSideLabel,
}: {
  /** Short variant label under the wordmark, e.g. "DRIVER". */
  label?: string;
  tagline: string;
  loadingProvider: AuthProvider | null;
  onApple: () => void;
  onGoogle: () => void;
  onEmailSignUp: () => void;
  onEmailSignIn: () => void;
  /** In the app that has both sides: the way back to the other one. */
  onSwitchSide?: () => void;
  switchSideLabel?: string;
}) {
  const busy = loadingProvider !== null;

  return (
    <AppScreen backgroundColor={brand.cream} contentStyle={styles.container}>
      <View style={styles.top}>
        <Animated.View entering={ZoomIn.duration(400)} style={styles.logoWrap}>
          {/* The clean black artwork inked orange, as on Welcome: the same mark on every first screen. */}
          <WheelersWordmark ink="black" style={styles.orangeMark} width={224} />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(100).duration(400)}>
          {label ? (
            <AppText variant="label" color={brand.muted} style={styles.label}>
              {label}
            </AppText>
          ) : null}
          <AppText variant="body" color={brand.muted} style={styles.tagline}>
            {tagline}
          </AppText>
        </Animated.View>
      </View>

      <Animated.View entering={FadeInDown.delay(250).duration(400)} style={styles.buttons}>
        {Platform.OS === "ios" && (
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={onApple}
            style={({ pressed }) => [
              styles.button,
              styles.appleButton,
              pressed && styles.pressed,
              busy && loadingProvider !== "apple" && styles.disabled,
            ]}
          >
            {loadingProvider === "apple" ? (
              <ActivityIndicator color={theme.colors.white} />
            ) : (
              <>
                <Ionicons name="logo-apple" size={22} color={theme.colors.white} />
                <AppText variant="label" color={theme.colors.white}>
                  Continue with Apple
                </AppText>
              </>
            )}
          </Pressable>
        )}

        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={onGoogle}
          style={({ pressed }) => [
            styles.button,
            styles.googleButton,
            pressed && styles.pressed,
            busy && loadingProvider !== "google" && styles.disabled,
          ]}
        >
          {loadingProvider === "google" ? (
            <ActivityIndicator color={brand.ink} />
          ) : (
            <>
              <GoogleIcon size={20} />
              <AppText variant="label" color={brand.ink}>
                Continue with Google
              </AppText>
            </>
          )}
        </Pressable>

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <AppText variant="monoSmall" color={brand.muted}>
            OR
          </AppText>
          <View style={styles.dividerLine} />
        </View>

        {/* Sign-in is the front door; creating an account is the exception,
            behind the footer link — not a primary button a review bot (or a
            hurried human) falls into by default. */}
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={onEmailSignIn}
          style={({ pressed }) => [
            styles.button,
            styles.emailButton,
            pressed && styles.pressed,
            busy && styles.disabled,
          ]}
        >
          <Ionicons name="mail-outline" size={20} color={brand.ink} />
          <AppText variant="label" color={brand.ink}>
            Sign in with email
          </AppText>
        </Pressable>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(350).duration(400)} style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          hitSlop={8}
          onPress={onEmailSignUp}
          style={({ pressed }) => [styles.signInRow, pressed && styles.signInPressed]}
        >
          <AppText variant="bodySmall" color={brand.muted}>
            {"Don't have an account? "}
          </AppText>
          <AppText variant="label" color={theme.colors.orange}>
            Sign up
          </AppText>
        </Pressable>

        {onSwitchSide ? (
          // The way across to the rider side, in type nobody has to hunt for:
          // dark, bold and underlined, with an arrow.
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            hitSlop={10}
            onPress={onSwitchSide}
            style={({ pressed }) => [styles.rideRow, pressed && styles.signInPressed]}
          >
            <AppText variant="h3" color={brand.ink} style={styles.rideText}>
              {switchSideLabel ?? "I want to ride instead"}
            </AppText>
            <Ionicons name="arrow-forward" size={20} color={brand.ink} />
          </Pressable>
        ) : null}

        <AppText variant="bodySmall" color={brand.muted} style={styles.terms}>
          By continuing you agree to our{" "}
          <AppText accessibilityRole="link" color={brand.ink} onPress={openTerms} style={styles.legalLink} variant="bodySmall">
            Terms of Service
          </AppText>{" "}
          and{" "}
          <AppText accessibilityRole="link" color={brand.ink} onPress={openPrivacy} style={styles.legalLink} variant="bodySmall">
            Privacy Policy
          </AppText>
        </AppText>
      </Animated.View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  legalLink: { textDecorationLine: "underline" },
  container: { justifyContent: "space-between", paddingTop: 80 },
  top: { alignItems: "center", gap: theme.spacing.lg },
  logoWrap: { marginBottom: theme.spacing.sm },
  label: { textAlign: "center", letterSpacing: 3 },
  orangeMark: { tintColor: theme.colors.orange },
  rideRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.xs, minHeight: 44 },
  rideText: { textDecorationLine: "underline" },
  tagline: { textAlign: "center", marginTop: theme.spacing.xs },
  buttons: { gap: theme.spacing.md, width: "100%" },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.sm,
    minHeight: 52,
    borderWidth: theme.borders.thick,
    borderRadius: theme.radius.sm,
    width: "100%",
    ...theme.shadows.card,
  },
  appleButton: { backgroundColor: brand.ink, borderColor: brand.ink },
  googleButton: { backgroundColor: theme.colors.white, borderColor: brand.ink },
  emailButton: { backgroundColor: brand.cream, borderColor: brand.ink },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  dividerLine: { flex: 1, height: theme.borders.regular, backgroundColor: brand.hairline },
  pressed: { transform: [{ translateX: 2 }, { translateY: 2 }], shadowOpacity: 0, elevation: 0 },
  disabled: { opacity: 0.6 },
  footer: { alignItems: "center", gap: theme.spacing.lg, paddingBottom: theme.spacing.lg },
  signInRow: { flexDirection: "row", alignItems: "center" },
  signInPressed: { opacity: 0.6 },
  terms: { textAlign: "center", maxWidth: 260 },
});
