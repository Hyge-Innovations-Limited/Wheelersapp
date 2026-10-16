import { isDriverApp, publicEntryRoute } from "@/lib/app-variant";
import { useAuth } from "@/lib/auth";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { Alert, StyleSheet, TextInput, View } from "react-native";

import { AppButton } from "@/components/app-button";
import { AppCard } from "@/components/app-card";
import { AppScreen } from "@/components/app-screen";
import { AppText } from "@/components/app-text";
import { BackArrow } from "@/components/back-arrow";
import { SettingsRow } from "@/components/SettingsRow";
import { clearStoredAuthState } from "@/lib/auth-state";
import { useAppLock } from "@/lib/app-lock";
import { RiderSecurityPin } from "@/components/rider/security-pin";
import { theme } from "@/theme";
import { toUserMessage } from "@/lib/error-messages";
import { biometricName } from "@/lib/biometrics";

/** One route for both sides of the app: each gets its own look. */
export default function SecurityPinScreen() {
  return isDriverApp ? <DriverSecurityPinScreen /> : <RiderSecurityPin />;
}

function DriverSecurityPinScreen() {
  const router = useRouter();
  const { logout } = useAuth();
  const { hasPin, appLockEnabled, createPin, changePin, clearPin, setAppLockEnabled, biometrics, biometricsEnabled, setBiometricsEnabled } =
    useAppLock();
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [currentPin, setCurrentPin] = useState("");
  const [nextPin, setNextPin] = useState("");
  const [confirmNextPin, setConfirmNextPin] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const normalizePinInput = (value: string) => value.replace(/\D/g, "").slice(0, 4);

  const handleCreatePin = async () => {
    if (pin.length !== 4 || confirmPin.length !== 4) {
      Alert.alert("PIN required", "Enter and confirm a 4-digit PIN.");
      return;
    }

    if (pin !== confirmPin) {
      Alert.alert("PIN mismatch", "Your PIN entries do not match.");
      return;
    }

    setIsSaving(true);
    try {
      await createPin(pin);
      setPin("");
      setConfirmPin("");
      Alert.alert("PIN created", "App lock is now enabled.");
    } catch (error) {
      Alert.alert(
        "PIN setup failed",
        toUserMessage(error, "Could not create your PIN."),
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePin = async () => {
    if (currentPin.length !== 4 || nextPin.length !== 4 || confirmNextPin.length !== 4) {
      Alert.alert("PIN required", "Fill in all PIN fields to continue.");
      return;
    }

    if (nextPin !== confirmNextPin) {
      Alert.alert("PIN mismatch", "Your new PIN entries do not match.");
      return;
    }

    setIsSaving(true);
    try {
      await changePin(currentPin, nextPin);
      setCurrentPin("");
      setNextPin("");
      setConfirmNextPin("");
      Alert.alert("PIN updated", "Your new PIN has been saved.");
    } catch (error) {
      Alert.alert(
        "PIN update failed",
        toUserMessage(error, "Could not change your PIN."),
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleLock = async () => {
    setIsSaving(true);
    try {
      await setAppLockEnabled(!appLockEnabled);
    } catch (error) {
      Alert.alert(
        "App lock update failed",
        toUserMessage(error, "Could not update app lock."),
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleForgotPin = async () => {
    if (isResetting) {
      return;
    }

    setIsResetting(true);
    try {
      await clearPin();
      await logout();
      await clearStoredAuthState();
      router.replace(publicEntryRoute);
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <AppScreen backgroundColor={theme.colors.offWhite} scroll contentStyle={styles.container}>
      <StatusBar style="dark" backgroundColor={theme.colors.offWhite} />

      <View style={styles.header}>
        <BackArrow />
        <View style={styles.headerCopy}>
          <AppText variant="screenTitle">Security & PIN</AppText>
          <AppText variant="bodySmall" color={theme.colors.muted}>
            Protect the app with a local PIN before anyone can open it.
          </AppText>
        </View>
      </View>

      {!hasPin ? (
        <AppCard style={styles.card}>
          <AppText variant="h3">Create PIN</AppText>
          <AppText variant="bodySmall" color={theme.colors.muted}>
            Use a 4-digit PIN. Once saved, Wheelers will ask for it before the app opens.
          </AppText>

          <PinField label="New PIN" value={pin} onChangeText={(value) => setPin(normalizePinInput(value))} />
          <PinField
            label="Confirm PIN"
            value={confirmPin}
            onChangeText={(value) => setConfirmPin(normalizePinInput(value))}
          />

          <AppButton disabled={isSaving} onPress={handleCreatePin} title="Save PIN" />
        </AppCard>
      ) : (
        <>
          <AppCard style={styles.card}>
            <AppText variant="h3">App Lock</AppText>
            <SettingsRow
              icon="lock-outline"
              onToggle={() => void handleToggleLock()}
              showDivider={false}
              title="Require PIN on app open"
              toggleValue={appLockEnabled}
            />
            {appLockEnabled && biometrics ? (
              <SettingsRow
                icon="fingerprint"
                onToggle={() =>
                  void setBiometricsEnabled(!biometricsEnabled).catch((error: unknown) =>
                    Alert.alert("Not switched on", toUserMessage(error, `${biometricName(biometrics)} could not be switched on.`)),
                  )
                }
                showDivider={false}
                title={`Unlock with ${biometricName(biometrics)}`}
                toggleValue={biometricsEnabled}
              />
            ) : null}
          </AppCard>

          <AppCard style={styles.card}>
            <AppText variant="h3">Change PIN</AppText>
            <PinField
              label="Current PIN"
              value={currentPin}
              onChangeText={(value) => setCurrentPin(normalizePinInput(value))}
            />
            <PinField
              label="New PIN"
              value={nextPin}
              onChangeText={(value) => setNextPin(normalizePinInput(value))}
            />
            <PinField
              label="Confirm new PIN"
              value={confirmNextPin}
              onChangeText={(value) => setConfirmNextPin(normalizePinInput(value))}
            />

            <AppButton disabled={isSaving} onPress={handleChangePin} title="Update PIN" />
          </AppCard>

          <AppCard style={styles.card}>
            <AppText variant="h3">Forgot PIN</AppText>
            <AppText variant="bodySmall" color={theme.colors.muted}>
              Resetting your PIN will sign you out first. You will set a new PIN after logging back in.
            </AppText>
            <AppButton
              disabled={isResetting}
              onPress={() => void handleForgotPin()}
              title="Reset PIN"
              variant="danger"
              style={styles.resetPinButton}
            />
          </AppCard>
        </>
      )}
    </AppScreen>
  );
}

function PinField({
  label,
  value,
  onChangeText,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
}) {
  return (
    <View style={styles.fieldGroup}>
      <AppText variant="bodySmall" color={theme.colors.muted}>
        {label}
      </AppText>
      <TextInput
        keyboardType="number-pad"
        maxLength={4}
        onChangeText={onChangeText}
        placeholder="••••"
        placeholderTextColor="#B5ACA4"
        secureTextEntry
        style={styles.input}
        value={value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.xxl,
    gap: theme.spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing.md,
  },
  headerCopy: {
    flex: 1,
    gap: theme.spacing.xxs,
  },
  card: {
    gap: theme.spacing.md,
  },
  fieldGroup: {
    gap: theme.spacing.xs,
  },
  input: {
    minHeight: 54,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.white,
    paddingHorizontal: theme.spacing.md,
    textAlign: "center",
    letterSpacing: 12,
    ...theme.typography.h3,
  },
  resetPinButton: {
    backgroundColor: theme.colors.dangerLight,
    shadowOpacity: 0,
    elevation: 0,
  },
});
