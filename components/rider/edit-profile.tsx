import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { RBack, RButton, RCard, RInput, RScreen, RText, rider } from "@/components/rider/kit";
import { getAccessTokenWithRetry } from "@/lib/access-token";
import { getCurrentProfile, updateCurrentProfile } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toUserMessage } from "@/lib/error-messages";
import { riderProfileChanged } from "@/lib/rider-profile";
import { looksLikeEmail } from "@/lib/rider-sign-in";

const { colors, fonts } = rider;

/** A rider's own details: their name and email. The phone number is how they sign in, so it stays. */
export function RiderEditProfile() {
  const router = useRouter();
  const { getAccessToken } = useAuth();
  const emailRef = useRef<TextInput>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const accessToken = await getAccessTokenWithRetry(getAccessToken);
        if (!accessToken) return;
        const { user } = await getCurrentProfile({ accessToken });
        if (!live) return;
        setName(user.name ?? "");
        setEmail(user.email ?? "");
        setPhone(user.phone ?? "");
      } catch (failure) {
        if (live) setError(toUserMessage(failure, "We could not load your details. Check your connection."));
      } finally {
        if (live) setLoaded(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [getAccessToken]);

  const cleanName = name.replace(/\s+/g, " ").trim();
  const ready = loaded && cleanName.length >= 2;

  async function save() {
    if (!ready || saving) return;
    const typedEmail = email.trim().toLowerCase();
    if (typedEmail && !looksLikeEmail(typedEmail)) {
      setEmailError("Enter a full email address, like name@example.com.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const accessToken = await getAccessTokenWithRetry(getAccessToken);
      if (!accessToken) throw new Error("Please sign in again.");
      await updateCurrentProfile({ accessToken, fullName: cleanName, email: typedEmail || undefined });
      // The You tab keeps a copy of these details: have it fetch the new ones.
      riderProfileChanged();
      router.back();
    } catch (failure) {
      setError(toUserMessage(failure, "We could not save your details. Please try again."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <RScreen contentStyle={styles.screen} scroll>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <RBack />
        <RText accessibilityRole="header" variant="title">
          Your details
        </RText>
      </View>

      <RInput
        autoCapitalize="words"
        autoComplete="name"
        hint="Drivers only see your first name."
        label="Name"
        onChangeText={(value) => {
          setName(value);
          setError(null);
        }}
        onSubmitEditing={() => emailRef.current?.focus()}
        returnKeyType="next"
        valid={cleanName.length >= 2}
        value={name}
      />

      <RInput
        autoCapitalize="none"
        autoComplete="email"
        autoCorrect={false}
        error={emailError}
        hint="For your receipts."
        keyboardType="email-address"
        label="Email address"
        labelNote="(optional)"
        onChangeText={(value) => {
          setEmail(value);
          setEmailError(null);
        }}
        onSubmitEditing={() => void save()}
        placeholder="you@example.com"
        ref={emailRef}
        returnKeyType="done"
        valid={looksLikeEmail(email)}
        value={email}
      />

      {phone ? (
        <RCard style={styles.phone} tone="outline">
          <RText color={colors.muted} variant="small">
            Phone number you sign in with
          </RText>
          <RText variant="bodyBold">{phone}</RText>
        </RCard>
      ) : null}

      <View style={styles.spacer} />

      {error ? (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          {error}
        </Text>
      ) : null}

      <RButton disabled={!ready} loading={saving} onPress={() => void save()} title="Save" />
    </RScreen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: 12, gap: 16 },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  phone: { gap: 2 },
  spacer: { flexGrow: 1, minHeight: 8 },
  error: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 19, color: colors.danger },
});
