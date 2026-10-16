import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { usePathname, useRouter } from "expo-router";
import {
  AppState,
  Alert,
  type AppStateStatus,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";

import { AppButton } from "@/components/app-button";
import { AppText } from "@/components/app-text";
import { publicEntryRoute } from "@/lib/app-variant";
import { biometricKind, biometricName, confirmOwner, type BiometricKind } from "@/lib/biometrics";
import { clearStoredAuthState } from "@/lib/auth-state";
import { theme } from "@/theme";

const APP_LOCK_KEY = "wheelers.app.lock.v1";
const PUBLIC_ROUTES = new Set([
  "/splash",
  "/welcome",
  "/choose",
  "/rider-phone",
  "/rider-code",
  "/rider-auth",
  "/account-auth",
  "/driver-auth",
  "/legal",
]);

type StoredAppLockState = {
  pinHash: string;
  appLockEnabled: boolean;
  /** Unlock with Face ID or a fingerprint; the PIN still works. */
  biometricsEnabled?: boolean;
};

type AppLockContextValue = {
  ready: boolean;
  hasPin: boolean;
  appLockEnabled: boolean;
  isLocked: boolean;
  createPin: (pin: string) => Promise<void>;
  changePin: (currentPin: string, nextPin: string) => Promise<void>;
  setAppLockEnabled: (enabled: boolean) => Promise<void>;
  /** Face ID or a fingerprint on this phone, when it has one set up; null when it has not. */
  biometrics: BiometricKind | null;
  biometricsEnabled: boolean;
  /** Turning it on asks for it once first, so it is only on when it works. Returns whether it is on. */
  setBiometricsEnabled: (enabled: boolean) => Promise<boolean>;
  unlockWithBiometrics: () => Promise<boolean>;
  unlock: (pin: string) => Promise<boolean>;
  lock: () => void;
  clearPin: () => Promise<void>;
};

const AppLockContext = createContext<AppLockContextValue | null>(null);

function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

async function hashPin(pin: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, pin);
}

async function readStoredAppLockState(): Promise<StoredAppLockState | null> {
  try {
    const raw = await SecureStore.getItemAsync(APP_LOCK_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<StoredAppLockState>;
    if (
      typeof parsed.pinHash !== "string" ||
      typeof parsed.appLockEnabled !== "boolean"
    ) {
      return null;
    }

    return {
      pinHash: parsed.pinHash,
      appLockEnabled: parsed.appLockEnabled,
      biometricsEnabled: parsed.biometricsEnabled === true,
    };
  } catch {
    return null;
  }
}

async function writeStoredAppLockState(
  state: StoredAppLockState | null,
): Promise<void> {
  if (!state) {
    await SecureStore.deleteItemAsync(APP_LOCK_KEY);
    return;
  }

  await SecureStore.setItemAsync(APP_LOCK_KEY, JSON.stringify(state));
}

export function AppLockProvider({ children }: PropsWithChildren) {
  const [ready, setReady] = useState(false);
  const [pinHash, setPinHash] = useState<string | null>(null);
  const [appLockEnabled, setAppLockEnabledState] = useState(false);
  const [isLocked, setLocked] = useState(false);
  const [biometrics, setBiometrics] = useState<BiometricKind | null>(null);
  const [biometricsEnabled, setBiometricsEnabledState] = useState(false);

  useEffect(() => {
    void (async () => {
      const [stored, kind] = await Promise.all([readStoredAppLockState(), biometricKind()]);
      setBiometrics(kind);
      setBiometricsEnabledState(Boolean(kind) && stored?.biometricsEnabled === true);
      setPinHash(stored?.pinHash ?? null);
      setAppLockEnabledState(stored?.appLockEnabled ?? false);
      setLocked(Boolean(stored?.pinHash) && Boolean(stored?.appLockEnabled));
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      (nextState: AppStateStatus) => {
        if (
          (nextState === "background" || nextState === "inactive") &&
          pinHash &&
          appLockEnabled
        ) {
          setLocked(true);
        }
      },
    );

    return () => subscription.remove();
  }, [appLockEnabled, pinHash]);

  const value = useMemo<AppLockContextValue>(
    () => ({
      ready,
      hasPin: Boolean(pinHash),
      appLockEnabled,
      isLocked,
      createPin: async (pin: string) => {
        if (!isValidPin(pin)) {
          throw new Error("PIN must be exactly 4 digits.");
        }

        const nextHash = await hashPin(pin);
        await writeStoredAppLockState({
          pinHash: nextHash,
          appLockEnabled: true,
          biometricsEnabled,
        });
        setPinHash(nextHash);
        setAppLockEnabledState(true);
        setLocked(false);
      },
      changePin: async (currentPin: string, nextPin: string) => {
        if (!pinHash) {
          throw new Error("Create a PIN first.");
        }

        const currentHash = await hashPin(currentPin);
        if (currentHash !== pinHash) {
          throw new Error("Current PIN is incorrect.");
        }

        if (!isValidPin(nextPin)) {
          throw new Error("New PIN must be exactly 4 digits.");
        }

        const nextHash = await hashPin(nextPin);
        await writeStoredAppLockState({
          pinHash: nextHash,
          appLockEnabled,
          biometricsEnabled,
        });
        setPinHash(nextHash);
      },
      setAppLockEnabled: async (enabled: boolean) => {
        if (!pinHash) {
          throw new Error("Create a PIN first.");
        }

        await writeStoredAppLockState({
          pinHash,
          appLockEnabled: enabled,
          biometricsEnabled,
        });
        setAppLockEnabledState(enabled);
        setLocked(enabled ? true : false);
      },
      biometrics,
      biometricsEnabled,
      setBiometricsEnabled: async (enabled: boolean) => {
        if (!pinHash) throw new Error("Create a PIN first.");
        if (enabled) {
          if (!biometrics) throw new Error("Set up Face ID or a fingerprint in your phone's settings first.");
          if (!(await confirmOwner(`Use ${biometricName(biometrics)} to unlock Wheelers`))) return false;
        }
        await writeStoredAppLockState({ pinHash, appLockEnabled, biometricsEnabled: enabled });
        setBiometricsEnabledState(enabled);
        return enabled;
      },
      unlockWithBiometrics: async () => {
        if (!biometricsEnabled || !biometrics) return false;
        const owner = await confirmOwner("Unlock Wheelers");
        if (owner) setLocked(false);
        return owner;
      },
      unlock: async (pin: string) => {
        if (!pinHash) {
          return true;
        }

        const attemptedHash = await hashPin(pin);
        const matched = attemptedHash === pinHash;
        if (matched) {
          setLocked(false);
        }
        return matched;
      },
      lock: () => {
        if (pinHash && appLockEnabled) {
          setLocked(true);
        }
      },
      clearPin: async () => {
        await writeStoredAppLockState(null);
        setPinHash(null);
        setAppLockEnabledState(false);
        setBiometricsEnabledState(false);
        setLocked(false);
      },
    }),
    [appLockEnabled, biometrics, biometricsEnabled, isLocked, pinHash, ready],
  );

  return (
    <AppLockContext.Provider value={value}>{children}</AppLockContext.Provider>
  );
}

export function useAppLock(): AppLockContextValue {
  const context = useContext(AppLockContext);
  if (!context) {
    throw new Error("useAppLock must be used within AppLockProvider.");
  }

  return context;
}

export function AppLockOverlay({
  onForgotPin,
}: {
  onForgotPin: () => Promise<void>;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { ready, hasPin, appLockEnabled, isLocked, unlock, clearPin, biometrics, biometricsEnabled, unlockWithBiometrics } =
    useAppLock();
  const [pin, setPin] = useState("");
  const [isResetting, setResetting] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!isLocked) {
      setPin("");
    }
  }, [isLocked]);

  // Locked, and they chose Face ID / fingerprint: ask at once, the PIN is the fallback.
  const shown = ready && hasPin && appLockEnabled && isLocked && !PUBLIC_ROUTES.has(pathname);
  useEffect(() => {
    if (shown && biometricsEnabled) void unlockWithBiometrics();
    // Once each time the lock comes up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, biometricsEnabled]);

  if (!shown) {
    return null;
  }

  return (
    <View style={styles.overlay}>
      <View style={styles.lockCard}>
        <View style={styles.lockBadge}>
          <AppText variant="h2">PIN</AppText>
        </View>
        <AppText variant="h2">Unlock Wheelers</AppText>
        <AppText variant="bodySmall" color={theme.colors.muted}>
          {biometricsEnabled ? `Use ${biometricName(biometrics)}, or enter your 4-digit PIN.` : "Enter your 4-digit PIN to continue."}
        </AppText>

        {biometricsEnabled ? (
          <AppButton
            onPress={() => void unlockWithBiometrics()}
            title={`Use ${biometricName(biometrics)}`}
            variant="inverse"
          />
        ) : null}

        <TextInput
          autoFocus
          keyboardType="number-pad"
          maxLength={4}
          onChangeText={(value) => {
            setPin(value.replace(/\D/g, ""));
          }}
          placeholder="••••"
          placeholderTextColor="#B5ACA4"
          secureTextEntry
          style={styles.pinInput}
          value={pin}
        />

        <AppButton
          onPress={() => {
            if (submittingRef.current) {
              return;
            }

            submittingRef.current = true;
            void (async () => {
              try {
                const matched = await unlock(pin);
                if (!matched) {
                  Alert.alert("Wrong PIN", "The PIN you entered is incorrect.");
                } else {
                  setPin("");
                }
              } finally {
                submittingRef.current = false;
              }
            })();
          }}
          title="Unlock"
        />

        <Pressable
          onPress={() => {
            if (isResetting) {
              return;
            }

            setResetting(true);
            void (async () => {
              try {
                await clearPin();
                await onForgotPin();
                await clearStoredAuthState();
                router.replace(publicEntryRoute);
              } finally {
                setResetting(false);
              }
            })();
          }}
          style={styles.forgotButton}
        >
          <AppText variant="label" color={theme.colors.orange}>
            {isResetting ? "Resetting..." : "Forgot PIN?"}
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.offWhite,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.layout.screenPadding,
    zIndex: 200,
  },
  lockCard: {
    width: "100%",
    maxWidth: 360,
    gap: theme.spacing.md,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.white,
    padding: theme.spacing.lg,
    alignItems: "center",
    ...theme.shadows.card,
  },
  lockBadge: {
    minWidth: 72,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radii.pill,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.orangeLight,
  },
  pinInput: {
    width: "100%",
    minHeight: 56,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.offWhite,
    paddingHorizontal: theme.spacing.md,
    textAlign: "center",
    ...theme.typography.h2,
    letterSpacing: 10,
  },
  forgotButton: {
    paddingVertical: theme.spacing.xs,
  },
});
