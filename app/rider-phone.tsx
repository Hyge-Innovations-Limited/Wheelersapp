import { Redirect, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BrandLogo } from "@/components/brand-logo";
import { DriveScene } from "@/components/rider/drive-scene";
import { RBack, RButton, RLink, RText, rider } from "@/components/rider/kit";
import { sendPhoneLoginCode } from "@/lib/api";
import { isDriverApp, publicEntryRoute } from "@/lib/app-variant";
import { groupNationalDigits, riderPhoneFrom, signInErrorMessage } from "@/lib/rider-sign-in";
import { rememberPendingCode } from "@/lib/rider-sign-in-state";

/** A rider's way in: their phone number, then a code. */
export default function RiderPhoneScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [typed, setTyped] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isDriverApp) {
    return <Redirect href={publicEntryRoute} />;
  }

  const phone = riderPhoneFrom(typed);

  async function sendCode() {
    if (!phone || sending) return;
    setSending(true);
    setError(null);
    try {
      const sent = await sendPhoneLoginCode({ phone });
      const sentAt = Date.now();
      // Leaving the app to read the code must not lose this step.
      await rememberPendingCode({ phone, channel: sent.channel, sentAt });
      router.push({ pathname: "/rider-code", params: { phone, channel: sent.channel, sentAt: String(sentAt) } });
    } catch (failure) {
      setError(signInErrorMessage(failure));
    } finally {
      setSending(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.screen}>
      <StatusBar style="light" />
      <ScrollView
        bounces={false}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={[styles.scene, { paddingTop: insets.top + 12 }]}>
          <View style={styles.sceneBar}>
            <RBack onInk />
            <BrandLogo size={44} />
          </View>
          <DriveScene dash={rider.colors.cream} ground="#1B1B1B" height={190} skyline="#262626" />
        </View>

        <View style={[styles.form, { paddingBottom: Math.max(insets.bottom, 12) + 12 }]}>
          <View style={styles.words}>
            <RText variant="display">Enter your phone number</RText>
            <RText color={rider.colors.muted}>
              We will send a code to confirm it. If you already use Wheelers on WhatsApp, enter the same number.
            </RText>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Phone number</Text>
            <View style={styles.phoneRow}>
              <View style={styles.country}>
                <View accessibilityLabel="Nigeria" style={styles.flag}>
                  <View style={styles.flagGreen} />
                  <View style={styles.flagWhite} />
                  <View style={styles.flagGreen} />
                </View>
                <Text style={styles.countryText}>+234</Text>
              </View>
              <TextInput
                accessibilityLabel="Phone number"
                autoComplete="tel"
                autoFocus
                keyboardType="number-pad"
                maxLength={14}
                onChangeText={(value) => {
                  setTyped(groupNationalDigits(value));
                  setError(null);
                }}
                onSubmitEditing={() => void sendCode()}
                placeholder="803 123 4567"
                placeholderTextColor="#8C837A"
                returnKeyType="done"
                style={[styles.input, error ? styles.inputError : null]}
                textContentType="telephoneNumber"
                value={typed}
              />
            </View>
            {error ? (
              <Text accessibilityLiveRegion="polite" style={styles.error}>
                {error}
              </Text>
            ) : null}
          </View>

          <View style={styles.spacer} />

          <RButton
            disabled={!phone}
            loading={sending}
            onPress={() => void sendCode()}
            title="Continue"
            variant="dark"
          />
          <RLink
            color={rider.colors.muted}
            onPress={() => router.push("/rider-auth")}
            title="Signed up with Apple, Google or email? Sign in here"
          />
          <RText color={rider.colors.muted} style={styles.terms} variant="caption">
            By continuing, you agree to our Terms and Privacy Policy.
          </RText>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: rider.colors.cream },
  scroll: { flexGrow: 1 },
  scene: { backgroundColor: rider.colors.ink, borderBottomLeftRadius: 32, borderBottomRightRadius: 32, overflow: "hidden" },
  sceneBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20 },
  form: { flex: 1, paddingHorizontal: 24, paddingTop: 24, gap: 16 },
  words: { gap: 8 },
  field: { gap: 8 },
  label: { fontFamily: rider.fonts.semibold, fontSize: 14, color: rider.colors.ink },
  phoneRow: { flexDirection: "row", gap: 10 },
  country: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 58,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: rider.colors.ink,
    backgroundColor: rider.colors.card,
  },
  countryText: { fontFamily: rider.fonts.bold, fontSize: 18, color: rider.colors.ink },
  flag: { flexDirection: "row", width: 24, height: 16, borderRadius: 2, overflow: "hidden", borderWidth: StyleSheet.hairlineWidth, borderColor: rider.colors.line },
  flagGreen: { flex: 1, backgroundColor: rider.colors.green },
  flagWhite: { flex: 1, backgroundColor: "#FFFFFF" },
  input: {
    flex: 1,
    minWidth: 0,
    height: 58,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: rider.colors.ink,
    backgroundColor: rider.colors.card,
    fontFamily: rider.fonts.bold,
    fontSize: 20,
    color: rider.colors.ink,
    fontVariant: ["tabular-nums"],
  },
  inputError: { borderColor: rider.colors.danger },
  error: { fontFamily: rider.fonts.semibold, fontSize: 14, lineHeight: 19, color: rider.colors.danger },
  spacer: { flexGrow: 1, minHeight: 8 },
  terms: { textAlign: "center" },
});
