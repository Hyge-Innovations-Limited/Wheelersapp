import { Ionicons } from "@expo/vector-icons";
import { Redirect, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { BrandLogo } from "@/components/brand-logo";
import { RButton, RCard, RInput, RScreen, RText, rider } from "@/components/rider/kit";
import { getAccessTokenWithRetry } from "@/lib/access-token";
import { updateCurrentProfile } from "@/lib/api";
import { isDriverApp, publicEntryRoute } from "@/lib/app-variant";
import { useAuth } from "@/lib/auth";
import { toUserMessage } from "@/lib/error-messages";
import { looksLikeEmail } from "@/lib/rider-sign-in";
import { openPrivacy, openTerms } from "@/lib/legal-links";
import { clearNameNeeded } from "@/lib/rider-sign-in-state";

const POINTS = [
  "Sign in with your phone number. No password needed.",
  "Fund your wallet by bank transfer.",
  "Works with your Wheelers WhatsApp account.",
];

/** A number we have not seen before: a name, an optional email, and they are in. */
export default function RiderNewScreen() {
  const router = useRouter();
  const { getAccessToken } = useAuth();
  const lastRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);

  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  if (isDriverApp) {
    return <Redirect href={publicEntryRoute} />;
  }

  const ready = first.trim().length >= 2 && last.trim().length >= 2 && agreed;

  async function create() {
    if (!ready || saving) return;
    const typedEmail = email.trim();
    if (typedEmail && !looksLikeEmail(typedEmail)) {
      setEmailError("Enter a full email address, like name@example.com.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const accessToken = await getAccessTokenWithRetry(getAccessToken);
      if (!accessToken) throw new Error("Please sign in again.");
      await updateCurrentProfile({
        accessToken,
        fullName: `${first.trim()} ${last.trim()}`,
        email: typedEmail || undefined,
      });
      await clearNameNeeded();
      router.replace("/rider");
    } catch (failure) {
      setError(toUserMessage(failure, "We could not save your details. Please try again."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <RScreen contentStyle={styles.content} scroll>
      <BrandLogo size={48} />

      <View style={styles.words}>
        <RText variant="display">Create your account</RText>
        <RText color={rider.colors.muted}>
          Enter your name to get started. Drivers only see your first name.
        </RText>
      </View>

      <View style={styles.names}>
        <RInput
          autoCapitalize="words"
          autoComplete="given-name"
          containerStyle={styles.name}
          label="First name"
          onChangeText={setFirst}
          onSubmitEditing={() => lastRef.current?.focus()}
          returnKeyType="next"
          textContentType="givenName"
          value={first}
        />
        <RInput
          autoCapitalize="words"
          autoComplete="family-name"
          containerStyle={styles.name}
          label="Last name"
          onChangeText={setLast}
          onSubmitEditing={() => emailRef.current?.focus()}
          ref={lastRef}
          returnKeyType="next"
          textContentType="familyName"
          value={last}
        />
      </View>

      <RInput
        autoCapitalize="none"
        autoComplete="email"
        autoCorrect={false}
        error={emailError}
        hint="We send your trip receipts here."
        keyboardType="email-address"
        label="Email address"
        labelNote="(optional)"
        onChangeText={(value) => {
          setEmail(value);
          setEmailError(null);
        }}
        placeholder="you@example.com"
        ref={emailRef}
        value={email}
      />

      <RCard style={styles.points}>
        {POINTS.map((point) => (
          <View key={point} style={styles.point}>
            <Ionicons color={rider.colors.orangeText} name="checkmark" size={18} />
            <RText style={styles.pointText} variant="small">
              {point}
            </RText>
          </View>
        ))}
      </RCard>

      <View style={styles.spacer} />

      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: agreed }}
        hitSlop={6}
        onPress={() => setAgreed((value) => !value)}
        style={styles.agree}>
        <View style={[styles.check, agreed ? styles.checkOn : null]}>
          {agreed ? <Ionicons color={rider.colors.cream} name="checkmark" size={16} /> : null}
        </View>
        <Text style={styles.agreeText}>
          I agree to the{" "}
          <Text accessibilityRole="link" onPress={openTerms} style={styles.legalLink}>
            Terms of Service
          </Text>{" "}
          and the{" "}
          <Text accessibilityRole="link" onPress={openPrivacy} style={styles.legalLink}>
            Privacy Policy
          </Text>
          .
        </Text>
      </Pressable>

      {error ? (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          {error}
        </Text>
      ) : null}

      <RButton disabled={!ready} loading={saving} onPress={() => void create()} title="Create account" />
    </RScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 16, gap: 16 },
  words: { gap: 8 },
  names: { flexDirection: "row", gap: 10 },
  name: { flex: 1 },
  points: { gap: 10, borderRadius: 18 },
  point: { flexDirection: "row", alignItems: "center", gap: 10 },
  pointText: { flex: 1 },
  spacer: { flexGrow: 1, minHeight: 4 },
  agree: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 },
  check: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: rider.colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  checkOn: { backgroundColor: rider.colors.ink },
  agreeText: { flex: 1, fontFamily: rider.fonts.medium, fontSize: 14, lineHeight: 20, color: rider.colors.ink },
  legalLink: { fontFamily: rider.fonts.bold, color: rider.colors.orangeText, textDecorationLine: "underline" },
  error: { fontFamily: rider.fonts.semibold, fontSize: 14, lineHeight: 19, color: rider.colors.danger },
});
