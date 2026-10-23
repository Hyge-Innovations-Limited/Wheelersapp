import { Redirect, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
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
import { RBack, RButton, RLink, RText, rider } from "@/components/rider/kit";
import { ApiError, passkeySignInOptions, sendPhoneLoginCode, signInWithPasskey } from "@/lib/api";
import { isDriverApp, publicEntryRoute } from "@/lib/app-variant";
import { useAuth } from "@/lib/auth";
import { toUserMessage } from "@/lib/error-messages";
import { finishRiderSignIn } from "@/lib/finish-rider-sign-in";
import { forgetPasskeyHere, PasskeyCancelled, passkeyHere, passkeysAvailable, rememberPasskeyHere, signWithPasskey, type PasskeyHere } from "@/lib/passkeys";
import { firstNameOf, groupNationalDigits, riderPhoneFrom, signInErrorMessage } from "@/lib/rider-sign-in";
import { rememberPendingCode } from "@/lib/rider-sign-in-state";

/**
 * A rider's way in: their phone number, then a code. The terms are answered
 * after the code, once per account.
 *
 * On a phone where a passkey is set up (lib/passkeys.ts, passkeyHere) the
 * passkey comes first: "Welcome back, Timi", one button, no phone box and no
 * keyboard, with the phone number one tap away. A passkey that no longer
 * works is forgotten and the phone number takes its place.
 */
export default function RiderPhoneScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [typed, setTyped] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const phone = riderPhoneFrom(typed);
  const { refreshAuthState } = useAuth();
  const [withPasskey, setWithPasskey] = useState(false);
  /** Only where it works: this build has passkeys and the phone supports them. */
  const [passkeyReady] = useState(() => passkeysAvailable());
  /** A passkey set up on this phone (undefined while it is being looked up), and whether they chose the phone number instead. */
  const [here, setHere] = useState<PasskeyHere | null | undefined>(passkeyReady ? undefined : null);
  const [usePhone, setUsePhone] = useState(false);
  /** The phone's passkey prompt closed without a passkey, in a row. */
  const cancelsRef = useRef(0);

  useEffect(() => {
    if (!passkeyReady) return;
    let live = true;
    void passkeyHere().then((found) => {
      if (live) setHere(found);
    });
    return () => {
      live = false;
    };
  }, [passkeyReady]);

  const passkeyFirst = passkeyReady && Boolean(here) && !usePhone;

  if (isDriverApp) {
    return <Redirect href={publicEntryRoute} />;
  }

  /** The terms, to read. Agreeing is asked once for the account, after the code, and only if it has not agreed already (here or on WhatsApp). */
  function readTerms() {
    router.push({ pathname: "/legal", params: { doc: "terms" } });
  }

  function onContinue() {
    if (phone && !sending) void sendCode(phone);
  }

  /** Face ID or a fingerprint instead of an SMS code: the same steps after, as after a code. */
  async function passkeySignIn() {
    if (withPasskey || sending) return;
    setWithPasskey(true);
    setError(null);
    let result: Awaited<ReturnType<typeof signInWithPasskey>>;
    let step: "options" | "phone" | "verify" = "options";
    try {
      const { challengeId, options } = await passkeySignInOptions();
      step = "phone";
      const response = await signWithPasskey(options);
      step = "verify";
      result = await signInWithPasskey({ challengeId, response });
    } catch (failure) {
      setWithPasskey(false);
      if (failure instanceof PasskeyCancelled) {
        // Closing the phone's own prompt is a choice, not a failure. Twice in a row
        // usually means this phone has no passkey to give: the phone number then.
        cancelsRef.current += 1;
        if (cancelsRef.current >= 2) setUsePhone(true);
        return;
      }
      // Only our server refusing the passkey means it is gone (removed, or another
      // account's). No connection, a busy server, a restart: kept, try again.
      const refused = step === "verify" && failure instanceof ApiError && failure.status >= 400 && failure.status < 500 && failure.status !== 408 && failure.status !== 429;
      if (refused) {
        await forgetPasskeyHere();
        setHere(null);
        setUsePhone(true);
        setError("That passkey did not work. Sign in with your phone number instead.");
      } else {
        setError(toUserMessage(failure, "Could not sign in with the passkey. Check your network and try again."));
      }
      return;
    }
    // Signed in: what follows is not the passkey's doing, so it never forgets it.
    try {
      cancelsRef.current = 0;
      // Next time on this phone, the passkey comes first again, with their name.
      await rememberPasskeyHere(firstNameOf(result.user.name ?? ""), result.user.id);
      await finishRiderSignIn(result, router, refreshAuthState);
    } catch (failure) {
      setError(toUserMessage(failure, "Could not finish signing in. Try again."));
    } finally {
      setWithPasskey(false);
    }
  }

  async function sendCode(number: string | null = phone) {
    const phone = number;
    if (!phone || sending) return;
    setSending(true);
    setError(null);
    try {
      const sent = await sendPhoneLoginCode({ phone });
      const sentAt = Date.now();
      // Leaving the app to read the code must not lose this step.
      await rememberPendingCode({ phone, channel: sent.channel, sentAt });
      router.push({ pathname: "/rider-code", params: { phone, sentAt: String(sentAt) } });
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

        {here === undefined ? (
          // A moment while this phone is checked for a passkey: nothing, rather than a keyboard that then goes away.
          <View style={styles.form} />
        ) : passkeyFirst ? (
          <View style={[styles.form, { paddingBottom: Math.max(insets.bottom, 12) + 12 }]}>
            <View style={styles.words}>
              <RText variant="display">{here?.name ? `Welcome back, ${here.name}` : "Welcome back"}</RText>
              <RText color={rider.colors.muted}>Sign in with Face ID or your fingerprint. No code to wait for.</RText>
            </View>

            {error ? (
              <Text accessibilityLiveRegion="polite" style={styles.error}>
                {error}
              </Text>
            ) : null}

            <View style={styles.spacer} />

            <RButton
              accessibilityHint="Signs you in with Face ID or a fingerprint"
              loading={withPasskey}
              onPress={() => void passkeySignIn()}
              title="Sign in with a passkey"
              variant="dark"
            />
            <RLink
              disabled={withPasskey}
              onPress={() => {
                setUsePhone(true);
                setError(null);
              }}
              style={styles.otherWay}
              title="Use my phone number instead"
            />
          </View>
        ) : (
        <View style={[styles.form, { paddingBottom: Math.max(insets.bottom, 12) + 12 }]}>
          <View style={styles.words}>
            <RText variant="display">Enter your phone number</RText>
            <RText color={rider.colors.muted}>We will text you a 6-digit code.</RText>
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
              onSubmitEditing={onContinue}
              placeholder="803 123 4567"
              placeholderTextColor="#8C837A"
              returnKeyType="done"
              style={[styles.input, error ? styles.inputError : null]}
              textContentType="telephoneNumber"
              value={typed}
            />
          </View>

          <Pressable accessibilityRole="link" hitSlop={8} onPress={readTerms} style={({ pressed }) => [styles.agree, pressed ? styles.pressed : null]}>
            <Text style={styles.agreeText}>
              Read the <Text style={styles.agreeLink}>Terms and Privacy Policy</Text>
            </Text>
          </Pressable>

          {error ? (
            <Text accessibilityLiveRegion="polite" style={styles.error}>
              {error}
            </Text>
          ) : null}

          <View style={styles.spacer} />

          <RButton
            disabled={!phone || withPasskey}
            loading={sending}
            onPress={onContinue}
            title="Continue"
            variant="dark"
          />
          {passkeyReady ? (
            <RButton
              accessibilityHint="Signs you in with Face ID or a fingerprint instead of a text message"
              disabled={sending}
              loading={withPasskey}
              onPress={() => void passkeySignIn()}
              size="md"
              style={styles.passkey}
              title="Sign in with a passkey"
              variant="ghost"
            />
          ) : null}
        </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  passkey: { marginTop: 12 },
  otherWay: { alignSelf: "center", marginTop: 8 },
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
