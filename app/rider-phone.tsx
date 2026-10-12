import { Ionicons } from "@expo/vector-icons";
import { Redirect, useFocusEffect, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BrandLogo } from "@/components/brand-logo";
import { DriveScene } from "@/components/rider/drive-scene";
import { RBack, RButton, RText, rider } from "@/components/rider/kit";
import { sendPhoneLoginCode } from "@/lib/api";
import { isDriverApp, publicEntryRoute } from "@/lib/app-variant";
import { groupNationalDigits, riderPhoneFrom, signInErrorMessage } from "@/lib/rider-sign-in";
import { rememberPendingCode } from "@/lib/rider-sign-in-state";
import { RIDER_TERMS_KEY, hasAcceptedTerms } from "@/lib/terms-acceptance";

/** A rider's way in: their phone number, the terms read and accepted, then a code. */
export default function RiderPhoneScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [typed, setTyped] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const phone = riderPhoneFrom(typed);

  // Ticked once the terms have been read and accepted on this phone; checked
  // again every time this screen comes back from the terms.
  useFocusEffect(
    useCallback(() => {
      let live = true;
      void hasAcceptedTerms(RIDER_TERMS_KEY).then((yes) => {
        if (live) setAccepted(yes);
      });
      return () => {
        live = false;
      };
    }, []),
  );

  if (isDriverApp) {
    return <Redirect href={publicEntryRoute} />;
  }

  function readTerms() {
    setError(null);
    router.push({ pathname: "/legal", params: accepted ? { doc: "terms" } : { mode: "accept", who: RIDER_TERMS_KEY } });
  }

  async function sendCode() {
    if (!phone || !accepted || sending) return;
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
            <RText color={rider.colors.muted}>Already ride with us on WhatsApp? Use that number.</RText>
          </View>

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

          {/* The tick is given by reading: tapping it opens the terms, and Accept there ticks it. */}
          <Pressable
            accessibilityHint={accepted ? "Opens the terms to read again" : "Opens the terms to read and accept"}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: accepted }}
            hitSlop={6}
            onPress={readTerms}
            style={({ pressed }) => [styles.agree, pressed ? styles.pressed : null]}>
            <View style={[styles.check, accepted ? styles.checkOn : null]}>
              {accepted ? <Ionicons color={rider.colors.cream} name="checkmark" size={16} /> : null}
            </View>
            <Text style={styles.agreeText}>
              I accept the <Text style={styles.agreeLink}>Terms and Privacy Policy</Text>
            </Text>
          </Pressable>

          {error ? (
            <Text accessibilityLiveRegion="polite" style={styles.error}>
              {error}
            </Text>
          ) : null}

          <View style={styles.spacer} />

          <RButton
            disabled={!phone || !accepted}
            loading={sending}
            onPress={() => void sendCode()}
            title="Continue"
            variant="dark"
          />
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
  agree: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 },
  check: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: rider.colors.ink,
    backgroundColor: rider.colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  checkOn: { backgroundColor: rider.colors.ink },
  agreeText: { flex: 1, fontFamily: rider.fonts.medium, fontSize: 15, lineHeight: 21, color: rider.colors.ink },
  agreeLink: { fontFamily: rider.fonts.bold, color: rider.colors.orangeText, textDecorationLine: "underline" },
  pressed: { opacity: 0.7 },
  error: { fontFamily: rider.fonts.semibold, fontSize: 14, lineHeight: 19, color: rider.colors.danger },
  spacer: { flexGrow: 1, minHeight: 8 },
});
