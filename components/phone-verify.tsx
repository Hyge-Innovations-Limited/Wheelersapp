import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from "react-native";

import { AppButton } from "@/components/app-button";
import { AppInput } from "@/components/app-input";
import { AppText, OnLight } from "@/components/app-text";
import { getAccessTokenWithRetry } from "@/lib/access-token";
import { ApiError, WaitError, getDriverPhone, sendDriverPhoneCode, verifyDriverPhoneCode } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { clock, localNumber, looksLikeNigerianMobile, secondsUntil, waitWords } from "@/lib/countdown";
import { toUserMessage } from "@/lib/error-messages";
import { theme } from "@/theme";

/**
 * A driver proves their phone number is theirs. They type it, a 6-digit code
 * goes to it (by SMS and on WhatsApp at once), and they type the code back.
 *
 * What the driver can see at every moment: where the code went, how long it
 * lasts (30 minutes), when they may ask for another (a minute apart, counted
 * down on the button), and how many are left. Asking for a sixth in half an
 * hour stops them for 30 minutes: the form locks and counts that down too,
 * rather than failing each time they press.
 */
type Props = {
  /** Called once the number is verified (also at once, when it already was). */
  onVerified: (phone: string) => void;
  /** The button under a verified number. */
  doneTitle: string;
  onDone: () => void;
  doneLoading?: boolean;
};

type Stage = "loading" | "number" | "code" | "verified";

export function PhoneVerify({ onVerified, doneTitle, onDone, doneLoading }: Props) {
  const { getAccessToken } = useAuth();
  const [stage, setStage] = useState<Stage>("loading");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [codesLeft, setCodesLeft] = useState<number | null>(null);
  const [verifiedPhone, setVerifiedPhone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"send" | "verify" | null>(null);
  // Moments (ms) until which another code cannot be asked for, and until which the driver is stopped.
  const [resendAt, setResendAt] = useState<number | null>(null);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const codeRef = useRef<TextInput>(null);
  const told = useRef(false);

  const resendIn = secondsUntil(resendAt, now);
  const lockedFor = secondsUntil(lockedUntil, now);
  const locked = lockedFor > 0;

  // One tick a second, only while something is being counted down.
  useEffect(() => {
    if (resendIn === 0 && lockedFor === 0) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [resendIn, lockedFor]);

  const token = useCallback(async () => {
    const t = await getAccessTokenWithRetry(getAccessToken);
    if (!t) throw new Error("Please sign in again to continue.");
    return t;
  }, [getAccessToken]);

  const verifiedNow = useCallback((number: string) => {
    setVerifiedPhone(number);
    setStage("verified");
    if (!told.current) { told.current = true; onVerified(number); }
  }, [onVerified]);

  // Start from where the server says things stand: already verified, a code already out, or stopped.
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const status = await getDriverPhone({ accessToken: await token() });
        if (!active) return;
        const at = Date.now();
        setPhone(localNumber(status.phone));
        if (status.lockedForSeconds > 0) setLockedUntil(at + status.lockedForSeconds * 1000);
        if (status.resendInSeconds > 0) setResendAt(at + status.resendInSeconds * 1000);
        if (status.verified && status.phone) { verifiedNow(status.phone); return; }
        if (status.codeSentTo) { setSentTo(status.codeSentTo); setStage("code"); return; }
        setStage("number");
      } catch (e) {
        if (!active) return;
        setError(toUserMessage(e, "We could not check your number. Type it below to carry on."));
        setStage("number");
      }
    })();
    return () => { active = false; };
  }, [token, verifiedNow]);

  /** A refusal that carries a wait starts the right countdown; every refusal is shown in the server's words. */
  const refused = (e: unknown, fallback: string) => {
    if (e instanceof WaitError) {
      const until = Date.now() + e.retryAfterSeconds * 1000;
      if (e.code === "TOO_MANY_CODES") { setLockedUntil(until); setCode(""); }
      else if (e.code === "WAIT_TO_RESEND") setResendAt(until);
    }
    if (e instanceof ApiError && (e.code === "CODE_EXPIRED" || e.code === "CODE_DEAD")) setCode("");
    setError(toUserMessage(e, fallback));
  };

  const send = async () => {
    if (busy || locked || resendIn > 0 || !looksLikeNigerianMobile(phone)) return;
    setBusy("send"); setError(null);
    try {
      const sent = await sendDriverPhoneCode({ accessToken: await token(), phone });
      setSentTo(sent.sentTo); setCodesLeft(sent.codesLeft);
      setResendAt(Date.now() + sent.resendInSeconds * 1000);
      setCode(""); setStage("code");
      setTimeout(() => codeRef.current?.focus(), 250);
    } catch (e) {
      refused(e, "The code was not sent. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const verify = async (typed = code) => {
    if (busy || locked || typed.length !== 6) return;
    setBusy("verify"); setError(null);
    try {
      const result = await verifyDriverPhoneCode({ accessToken: await token(), code: typed });
      verifiedNow(result.phone);
    } catch (e) {
      refused(e, "The code was not checked. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  if (stage === "loading") return <ActivityIndicator color={theme.colors.orange} style={styles.loading} />;

  if (stage === "verified") {
    return (
      <View style={styles.block}>
        <View style={[styles.note, styles.noteGood]}>
          <OnLight>
          <Ionicons name="checkmark-circle" size={22} color={theme.colors.green} />
          <AppText variant="bodyMedium" style={styles.flex}>{localNumber(verifiedPhone)} is verified.</AppText>
          </OnLight>
        </View>
        <View style={styles.spacer} />
        <AppButton title={doneTitle} onPress={onDone} loading={doneLoading} />
        <Pressable
          onPress={() => { setStage("number"); setError(null); setCode(""); }}
          hitSlop={8}
          style={styles.link}
          accessibilityRole="button">
          <AppText variant="bodySmall" color={theme.colors.muted}>Use a different number</AppText>
        </Pressable>
      </View>
    );
  }

  const lockNote = locked ? (
    <View style={[styles.note, styles.noteBad]} accessibilityLiveRegion="polite">
      <OnLight>
      <Ionicons name="time-outline" size={22} color={theme.colors.danger} />
      <View style={styles.flex}>
        <AppText variant="bodyMedium">Too many codes asked for</AppText>
        <AppText variant="bodySmall" color={theme.colors.muted}>
          For your security you can ask for a new code in {clock(lockedFor)} ({waitWords(lockedFor)}). Nothing else is wrong with your account.
        </AppText>
      </View>
      </OnLight>
    </View>
  ) : null;

  if (stage === "number") {
    return (
      <View style={styles.block}>
        {lockNote}
        <AppInput
          label="Phone number"
          hint="We will send a 6-digit code to this number"
          placeholder="e.g. 0803 123 4567"
          value={phone}
          onChangeText={(text) => { setPhone(text); setError(null); }}
          keyboardType="phone-pad"
          maxLength={17}
          editable={!locked}
          returnKeyType="done"
          onSubmitEditing={() => void send()}
          error={!locked && error ? error : undefined}
        />
        <View style={styles.spacer} />
        <AppButton
          title={locked ? `Try again in ${clock(lockedFor)}` : resendIn > 0 ? `Send code in ${clock(resendIn)}` : "Send code"}
          onPress={() => void send()}
          disabled={locked || resendIn > 0 || !looksLikeNigerianMobile(phone)}
          loading={busy === "send"}
        />
      </View>
    );
  }

  // stage === "code"
  return (
    <View style={styles.block}>
      {lockNote}
      <View style={styles.note}>
        <OnLight>
        <Ionicons name="chatbubble-ellipses-outline" size={22} color={theme.colors.orange} />
        <AppText variant="bodySmall" style={styles.flex}>
          We sent a 6-digit code to {sentTo ?? "your number"}. It lasts 30 minutes.
        </AppText>
        </OnLight>
      </View>
      <AppInput
        ref={codeRef}
        label="Code"
        placeholder="6 digits"
        value={code}
        onChangeText={(text) => {
          const digits = text.replace(/\D/g, "").slice(0, 6);
          setCode(digits); setError(null);
          // The sixth digit sends it: nothing more to press.
          if (digits.length === 6 && code.length < 6) void verify(digits);
        }}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={6}
        editable={!locked && busy !== "verify"}
        returnKeyType="done"
        onSubmitEditing={() => void verify()}
        error={!locked && error ? error : undefined}
      />
      <View style={styles.spacer} />
      <AppButton title="Verify" onPress={() => void verify()} disabled={locked || code.length !== 6} loading={busy === "verify"} />
      <View style={styles.links}>
        <Pressable
          onPress={() => void send()}
          disabled={locked || resendIn > 0 || busy !== null}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={resendIn > 0 ? `Send again in ${waitWords(resendIn)}` : "Send the code again"}>
          <AppText variant="bodySmall" color={locked || resendIn > 0 ? theme.colors.mutedLight : theme.colors.orange}>
            {busy === "send" ? "Sending…" : locked ? `Send again in ${clock(lockedFor)}` : resendIn > 0 ? `Send again in ${clock(resendIn)}` : "Send again"}
            {!locked && codesLeft !== null && codesLeft <= 2 ? ` (${codesLeft} left)` : ""}
          </AppText>
        </Pressable>
        <Pressable onPress={() => { setStage("number"); setError(null); setCode(""); }} hitSlop={8} accessibilityRole="button">
          <AppText variant="bodySmall" color={theme.colors.muted}>Change number</AppText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { flexGrow: 1, gap: theme.spacing.lg },
  loading: { marginTop: theme.spacing.xxl },
  flex: { flex: 1, minWidth: 0 },
  note: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.white,
  },
  noteGood: { borderColor: theme.colors.green },
  noteBad: { borderColor: theme.colors.danger, backgroundColor: theme.colors.dangerLight, alignItems: "flex-start" },
  spacer: { flexGrow: 1, minHeight: theme.spacing.lg },
  links: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: theme.spacing.xs },
  link: { alignSelf: "center", paddingTop: theme.spacing.xs },
});
