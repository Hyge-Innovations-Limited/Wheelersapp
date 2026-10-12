import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { RBack, RButton, RLink, RScreen, RText, rider } from "@/components/rider/kit";
import { storeLocalAccessToken } from "@/lib/access-token";
import { sendPhoneLoginCode, verifyPhoneLoginCode } from "@/lib/api";
import { isDriverApp, publicEntryRoute } from "@/lib/app-variant";
import { persistAuthenticatedRole } from "@/lib/auth-state";
import { useAuth } from "@/lib/auth";
import { clearNameNeeded, forgetPendingCode, markNameNeeded, rememberPendingCode } from "@/lib/rider-sign-in-state";
import { secondsUntil } from "@/lib/countdown";
import {
  CODE_LENGTH,
  RESEND_WAIT_SECONDS,
  firstNameOf,
  resendLabel,
  signInErrorMessage,
  spacedPhone,
} from "@/lib/rider-sign-in";

/** Type the 6-digit code, which always comes by SMS. A known number goes to "welcome back"; a new one to a short sign-up. */
export default function RiderCodeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ phone?: string; sentAt?: string }>();
  // When the code went out: the wait to ask again counts from then, also
  // after coming back to this screen from outside the app.
  const sentAtParam = Number(params.sentAt);
  const firstSentAt = Number.isFinite(sentAtParam) && sentAtParam > 0 ? sentAtParam : Date.now();
  const phone = typeof params.phone === "string" ? params.phone : "";
  const { refreshAuthState } = useAuth();

  const inputRef = useRef<TextInput>(null);
  const checkingRef = useRef(false);
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendAt, setResendAt] = useState(() => firstSentAt + RESEND_WAIT_SECONDS * 1000);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (isDriverApp) {
    return <Redirect href={publicEntryRoute} />;
  }
  if (!phone) {
    return <Redirect href="/rider-phone" />;
  }

  const waitLeft = secondsUntil(resendAt, now);

  async function check(entered: string) {
    // A ref, not the state: SMS autofill can deliver the digits twice in one
    // tick, before a state change would be seen.
    if (checkingRef.current || entered.length !== CODE_LENGTH) return;
    checkingRef.current = true;
    setChecking(true);
    setError(null);
    try {
      const result = await verifyPhoneLoginCode({ phone, code: entered });
      const name = result.user.name?.trim() ?? "";
      const needsName = result.isNewUser || !name;
      await forgetPendingCode();
      // Said before they are signed in, so closing the app on the name screen
      // comes back to the name screen.
      if (needsName) await markNameNeeded();
      else await clearNameNeeded();
      await storeLocalAccessToken(result.accessToken);
      await persistAuthenticatedRole("RIDER");
      await refreshAuthState();

      // The sign-in screens are done with: Back from inside the app must not
      // walk into them again.
      if (router.canDismiss()) router.dismissAll();

      if (needsName) {
        router.replace("/rider-new");
      } else {
        router.replace({
          pathname: "/rider-welcome-back",
          params: { name: firstNameOf(name), email: result.user.email ?? "" },
        });
      }
    } catch (failure) {
      setError(signInErrorMessage(failure));
      setCode("");
      inputRef.current?.focus();
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  }

  async function resend() {
    if (resending || waitLeft > 0) return;
    setResending(true);
    setError(null);
    try {
      const sent = await sendPhoneLoginCode({ phone });
      await rememberPendingCode({ phone, channel: sent.channel, sentAt: Date.now() });
      setCode("");
      setResendAt(Date.now() + RESEND_WAIT_SECONDS * 1000);
      inputRef.current?.focus();
    } catch (failure) {
      setError(signInErrorMessage(failure));
    } finally {
      setResending(false);
    }
  }

  return (
    <RScreen contentStyle={styles.content} scroll>
      <RBack />

      <View style={styles.words}>
        <RText variant="display">Enter the 6-digit code</RText>
        <RText color={rider.colors.muted}>
          Sent by SMS to{" "}
          <Text style={styles.phone}>{spacedPhone(phone)}</Text>
        </RText>
      </View>

      <Pressable
        accessibilityLabel={`Code, ${code.length} of ${CODE_LENGTH} digits entered`}
        onPress={() => inputRef.current?.focus()}
        style={styles.boxes}>
        {Array.from({ length: CODE_LENGTH }, (_, index) => {
          const digit = code[index];
          const current = index === code.length && !checking;
          return (
            <View
              key={index}
              style={[styles.box, current ? styles.boxCurrent : null, error ? styles.boxError : null]}>
              <Text maxFontSizeMultiplier={1} style={styles.digit}>
                {digit ?? ""}
              </Text>
            </View>
          );
        })}
        <TextInput
          accessibilityLabel="Verification code"
          autoComplete="sms-otp"
          autoFocus
          caretHidden
          keyboardType="number-pad"
          maxLength={CODE_LENGTH}
          onChangeText={(value) => {
            const digits = value.replace(/\D/g, "").slice(0, CODE_LENGTH);
            setCode(digits);
            setError(null);
            if (digits.length === CODE_LENGTH) void check(digits);
          }}
          ref={inputRef}
          style={styles.hiddenInput}
          textContentType="oneTimeCode"
          value={code}
        />
      </Pressable>

      {error ? (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          {error}
        </Text>
      ) : null}

      <View style={styles.links}>
        <RLink
          color={waitLeft > 0 ? rider.colors.muted : rider.colors.orangeText}
          disabled={waitLeft > 0 || resending}
          onPress={() => void resend()}
          title={resending ? "Sending" : resendLabel(waitLeft)}
        />
        <RLink
          onPress={() => {
            void forgetPendingCode();
            // Not "back": after returning to the app this screen sits on the
            // welcome screen, not on the number screen.
            router.replace("/rider-phone");
          }}
          title="Change number"
        />
      </View>

      <View style={styles.spacer} />
      <RButton
        disabled={code.length !== CODE_LENGTH}
        loading={checking}
        onPress={() => void check(code)}
        title="Continue"
        variant="dark"
      />
    </RScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 12, gap: 20 },
  words: { gap: 8, paddingTop: 8 },
  phone: { fontFamily: rider.fonts.bold, color: rider.colors.ink },
  boxes: { flexDirection: "row", gap: 8 },
  box: {
    flex: 1,
    height: 64,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: rider.colors.line,
    backgroundColor: rider.colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  boxCurrent: { borderColor: rider.colors.ink },
  boxError: { borderColor: rider.colors.danger },
  digit: { fontFamily: rider.fonts.display, fontSize: 28, color: rider.colors.ink },
  // Kept on screen so the keyboard and SMS autofill work; the boxes show what is typed.
  hiddenInput: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0.01, color: "transparent" },
  error: { fontFamily: rider.fonts.semibold, fontSize: 14, lineHeight: 19, color: rider.colors.danger },
  links: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  spacer: { flexGrow: 1, minHeight: 12 },
});
