import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { StyleSheet, Switch, Text, TextInput, View } from "react-native";

import { RBack, RButton, RCard, RScreen, RText, rider } from "@/components/rider/kit";
import { useAppLock } from "@/lib/app-lock";
import { publicEntryRoute } from "@/lib/app-variant";
import { useAuth } from "@/lib/auth";
import { clearStoredAuthState } from "@/lib/auth-state";
import { toUserMessage } from "@/lib/error-messages";

const { colors, fonts } = rider;
const digits = (value: string) => value.replace(/\D/g, "").slice(0, 4);

/** The rider's app lock: a 4-digit PIN asked for when the app opens. */
export function RiderSecurityPin() {
  const router = useRouter();
  const { logout } = useAuth();
  const { hasPin, appLockEnabled, createPin, changePin, clearPin, setAppLockEnabled } = useAppLock();
  const [current, setCurrent] = useState("");
  const [pin, setPin] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const filled = pin.length === 4 && again.length === 4 && (!hasPin || current.length === 4);

  function typed(set: (value: string) => void) {
    return (value: string) => {
      set(digits(value));
      setError(null);
      setSaved(null);
    };
  }

  async function save() {
    if (!filled || busy) return;
    if (pin !== again) {
      setError("The two PINs are not the same.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (hasPin) await changePin(current, pin);
      else await createPin(pin);
      setSaved(hasPin ? "Your new PIN is saved." : "PIN saved. The app now asks for it when it opens.");
      setCurrent("");
      setPin("");
      setAgain("");
    } catch (failure) {
      setError(toUserMessage(failure, "Your PIN could not be saved. Try again."));
    } finally {
      setBusy(false);
    }
  }

  async function toggle() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await setAppLockEnabled(!appLockEnabled);
    } catch (failure) {
      setError(toUserMessage(failure, "The app lock could not be changed. Try again."));
    } finally {
      setBusy(false);
    }
  }

  async function forgot() {
    if (resetting) return;
    setResetting(true);
    try {
      await clearPin();
      await logout();
      await clearStoredAuthState();
      router.replace(publicEntryRoute);
    } finally {
      setResetting(false);
    }
  }

  return (
    <RScreen contentStyle={styles.screen} scroll>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <RBack />
        <RText accessibilityRole="header" variant="title">
          Security PIN
        </RText>
      </View>

      {hasPin ? (
        <RCard style={styles.lockRow}>
          <View style={styles.flex}>
            <RText variant="bodyBold">Ask for my PIN</RText>
            <RText color={colors.muted} variant="small">
              Every time the app opens
            </RText>
          </View>
          <Switch
            accessibilityLabel="Ask for my PIN when the app opens"
            disabled={busy}
            onValueChange={() => void toggle()}
            thumbColor={colors.card}
            trackColor={{ false: colors.line, true: colors.orange }}
            value={appLockEnabled}
          />
        </RCard>
      ) : null}

      <RCard style={styles.block}>
        <RText variant="heading">{hasPin ? "Change your PIN" : "Create a PIN"}</RText>
        {hasPin ? null : (
          <RText color={colors.muted} variant="small">
            4 digits. The app asks for it when it opens.
          </RText>
        )}
        {hasPin ? <PinBox label="Current PIN" onChangeText={typed(setCurrent)} value={current} /> : null}
        <PinBox label={hasPin ? "New PIN" : "PIN"} onChangeText={typed(setPin)} value={pin} />
        <PinBox label={hasPin ? "New PIN again" : "PIN again"} onChangeText={typed(setAgain)} value={again} />
        {error ? (
          <Text accessibilityLiveRegion="polite" style={styles.error}>
            {error}
          </Text>
        ) : null}
        {saved ? (
          <Text accessibilityLiveRegion="polite" style={styles.saved}>
            {saved}
          </Text>
        ) : null}
        <RButton
          disabled={!filled}
          loading={busy}
          onPress={() => void save()}
          title={hasPin ? "Save new PIN" : "Save PIN"}
          variant="dark"
        />
      </RCard>

      {hasPin ? (
        <RCard style={styles.block} tone="outline">
          <RText variant="bodyBold">Forgot your PIN?</RText>
          <RText color={colors.muted} variant="small">
            You will be logged out. Sign in again, then create a new PIN.
          </RText>
          <RButton loading={resetting} onPress={() => void forgot()} size="md" title="Log out and reset PIN" variant="danger" />
        </RCard>
      ) : null}
    </RScreen>
  );
}

function PinBox({ label, value, onChangeText }: { label: string; value: string; onChangeText: (value: string) => void }) {
  return (
    <View style={styles.field}>
      <Text maxFontSizeMultiplier={1.15} style={styles.label}>
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        keyboardType="number-pad"
        maxLength={4}
        onChangeText={onChangeText}
        secureTextEntry
        style={[styles.input, value.length === 4 ? styles.inputFull : null]}
        value={value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: 12, gap: 14 },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  flex: { flex: 1 },
  lockRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  block: { gap: 12 },
  field: { gap: 6 },
  label: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 19, color: colors.ink },
  input: {
    height: 58,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.card,
    textAlign: "center",
    fontFamily: fonts.bold,
    fontSize: 24,
    color: colors.ink,
  },
  inputFull: { borderColor: colors.green },
  error: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 19, color: colors.danger },
  saved: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 19, color: colors.green },
});
