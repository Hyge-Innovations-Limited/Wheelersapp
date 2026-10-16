import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { BackHandler, StyleSheet, View } from "react-native";

import { RButton, RInput, RScreen, RText, rider } from "@/components/rider/kit";
import { getAccessTokenWithRetry } from "@/lib/access-token";
import { updateCurrentProfile } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toUserMessage } from "@/lib/error-messages";

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Every account has an email: for receipts, and a way back into the account.
 * Asked straight after the privacy policy at sign-in, and once of anyone who
 * signed up before it was. There is no skip.
 *
 *   /rider-email?next=<route as JSON>   where to go once it is saved
 *   /rider-email                         asked over Home (lib/email-gate.ts): back to it after
 */
export default function RiderEmailScreen() {
  const router = useRouter();
  const { getAccessToken, refreshAuthState } = useAuth();
  const params = useLocalSearchParams<{ next?: string }>();
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const looksRight = EMAIL_SHAPE.test(email.trim());

  // Compulsory: Android's back does not walk past it.
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => subscription.remove();
  }, []);

  function onward() {
    try {
      const next = JSON.parse(typeof params.next === "string" ? params.next : "") as { pathname?: unknown; params?: unknown };
      if (typeof next.pathname === "string" && next.pathname.startsWith("/")) {
        router.replace({ pathname: next.pathname, params: (next.params ?? {}) as Record<string, string> } as never);
        return;
      }
    } catch {
      // Nothing handed in: asked over Home, so back to it.
    }
    if (router.canGoBack()) router.back();
    else router.replace("/rider");
  }

  async function save() {
    const wanted = email.trim().toLowerCase();
    if (saving) return;
    if (!EMAIL_SHAPE.test(wanted)) {
      setError("That does not look like an email address. Check it and try again.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const accessToken = await getAccessTokenWithRetry(getAccessToken);
      if (!accessToken) throw new Error("Please sign in again.");
      await updateCurrentProfile({ accessToken, email: wanted });
      await refreshAuthState().catch(() => undefined);
      onward();
    } catch (failure) {
      setError(toUserMessage(failure, "We could not save your email. Please try again."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <RScreen contentStyle={styles.content} scroll>
      <View style={styles.words}>
        <RText accessibilityRole="header" variant="display">
          Your email
        </RText>
        <RText color={rider.colors.muted}>For your receipts, and to get back into your account if you ever need to.</RText>
      </View>

      <RInput
        autoCapitalize="none"
        autoComplete="email"
        autoCorrect={false}
        autoFocus
        error={error}
        inputMode="email"
        keyboardType="email-address"
        label="Email address"
        onChangeText={(value) => {
          setEmail(value);
          setError(null);
        }}
        onSubmitEditing={() => void save()}
        placeholder="you@example.com"
        returnKeyType="done"
        textContentType="emailAddress"
        valid={looksRight}
        value={email}
      />

      <View style={styles.spacer} />
      <RButton disabled={!looksRight} loading={saving} onPress={() => void save()} title="Continue" variant="dark" />
    </RScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 24, gap: 20 },
  words: { gap: 8, paddingTop: 8 },
  spacer: { flexGrow: 1, minHeight: 12 },
});
