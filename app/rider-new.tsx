import { riderProfileChanged } from "@/lib/rider-profile";
import { Redirect, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { BrandLogo } from "@/components/brand-logo";
import { RButton, RInput, RScreen, RText, rider } from "@/components/rider/kit";
import { getAccessTokenWithRetry } from "@/lib/access-token";
import { updateCurrentProfile } from "@/lib/api";
import { isDriverApp, publicEntryRoute } from "@/lib/app-variant";
import { useAuth } from "@/lib/auth";
import { toUserMessage } from "@/lib/error-messages";
import { REFERRAL_CODE_MIN, addReferralAtSignUp, tidyReferralCode } from "@/lib/referral-entry";
import { looksLikeEmail } from "@/lib/rider-sign-in";
import { clearNameNeeded } from "@/lib/rider-sign-in-state";

/** A number we have not seen before: a name, an optional email and referral code, and they are in. */
export default function RiderNewScreen() {
  const router = useRouter();
  const { getAccessToken } = useAuth();
  const lastRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const referralRef = useRef<TextInput>(null);

  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [referral, setReferral] = useState("");
  const [referralError, setReferralError] = useState<string | null>(null);

  if (isDriverApp) {
    return <Redirect href={publicEntryRoute} />;
  }

  const ready = first.trim().length >= 2 && last.trim().length >= 2;

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
      // The account exists from the moment the code was checked, so a friend's
      // code can go on it now. A refused one is theirs to fix or clear.
      const refused = await addReferralAtSignUp(accessToken, referral);
      if (refused) {
        setReferralError(refused);
        return;
      }
      await updateCurrentProfile({
        accessToken,
        fullName: `${first.trim()} ${last.trim()}`,
        email: typedEmail || undefined,
      });
      await clearNameNeeded();
      riderProfileChanged();
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
          Drivers only see your first name.
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
          valid={first.trim().length >= 2}
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
          valid={last.trim().length >= 2}
          value={last}
        />
      </View>

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
        onSubmitEditing={() => referralRef.current?.focus()}
        placeholder="you@example.com"
        ref={emailRef}
        returnKeyType="next"
        valid={looksLikeEmail(email)}
        value={email}
      />

      <RInput
        autoCapitalize="characters"
        autoCorrect={false}
        error={referralError}
        hint="From a friend or a driver."
        label="Referral code"
        labelNote="(optional)"
        maxLength={12}
        onChangeText={(value) => {
          setReferral(tidyReferralCode(value));
          setReferralError(null);
        }}
        onSubmitEditing={() => void create()}
        ref={referralRef}
        returnKeyType="done"
        valid={referral.length >= REFERRAL_CODE_MIN && !referralError}
        value={referral}
      />

      <View style={styles.spacer} />

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
  spacer: { flexGrow: 1, minHeight: 4 },
  error: { fontFamily: rider.fonts.semibold, fontSize: 14, lineHeight: 19, color: rider.colors.danger },
});
