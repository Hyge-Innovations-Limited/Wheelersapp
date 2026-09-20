import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

import { AppText } from '@/components/app-text';
import { getAccessTokenWithRetry, type AccessTokenGetter } from '@/lib/access-token';
import { getDriverStandby, setDriverStandby } from '@/lib/api';
import { useAppLocation } from '@/lib/location';
import {
  disableStandby,
  pauseStandbyUpdates,
  isStandbyEnabledLocally,
  isStandbySupported,
  resumeStandbyIfEnabled,
  setStandbyEnabledLocally,
} from '@/lib/standby-location';
import { theme } from '@/theme';

const OFFERED_KEY = 'wheelers.driver.standby.offered';
// The driver switched alerts off but the server never heard. Until it does,
// the server's "on" must not be allowed to switch them back on.
const PENDING_OFF_KEY = 'wheelers.driver.standby.pendingOff';

/**
 * "Nearby ride alerts" — the driver's switch for letting Wheelers see a rough
 * position while they are OFF shift, so we can tell them about a rider close by.
 *
 *   const alerts = useNearbyAlerts(getAccessToken, isOnline);
 *   <Switch value={alerts.enabled} onValueChange={alerts.toggle} />
 *   {alerts.sheet}
 *
 * The sheet is the prominent disclosure Play requires before the OS location
 * prompt: what is collected, when, why, and how to stop — with a real "Not now".
 */
export function useNearbyAlerts(
  getAccessToken: AccessTokenGetter,
  isOnline: boolean,
) {
  const insets = useSafeAreaInsets();
  const { requestLocationAccess } = useAppLocation();
  const [enabled, setEnabled] = useState(false);
  const [supported, setSupported] = useState(true);
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(false);
  const resolverRef = useRef<((accepted: boolean) => void) | null>(null);

  // However the driver came to be online (button, restored session), the
  // precise heartbeat owns location from then on and the rough one steps aside.
  const onlineRef = useRef(isOnline);
  useEffect(() => {
    onlineRef.current = isOnline;
    if (isOnline) void pauseStandbyUpdates();
  }, [isOnline]);

  // What this phone remembers first (instant), then what the server says (truth).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [local, canRun] = await Promise.all([isStandbyEnabledLocally(), isStandbySupported()]);
      if (cancelled) return;
      setEnabled(local);
      setSupported(canRun);
      try {
        const token = await getAccessTokenWithRetry(getAccessToken);
        if (!token || cancelled) return;
        const pendingOff = await AsyncStorage.getItem(PENDING_OFF_KEY).catch(() => null);
        const remote = pendingOff
          ? await setDriverStandby({ accessToken: token, enabled: false })
          : await getDriverStandby({ accessToken: token });
        if (pendingOff) await AsyncStorage.removeItem(PENDING_OFF_KEY).catch(() => undefined);
        if (cancelled) return;
        setEnabled(remote.enabled);
        if (remote.enabled) {
          await setStandbyEnabledLocally(true);
          // App start, or a fresh login on a phone that had it on before.
          if (!onlineRef.current) await resumeStandbyIfEnabled(token);
        } else {
          await disableStandby();
        }
      } catch {
        // Offline or an older backend: keep what the phone remembers.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getAccessToken]);

  const settle = useCallback((accepted: boolean) => {
    setVisible(false);
    const resolve = resolverRef.current;
    resolverRef.current = null;
    resolve?.(accepted);
  }, []);

  const explain = useCallback((): Promise<boolean> => {
    resolverRef.current?.(false);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setVisible(true);
    });
  }, []);

  const turnOn = useCallback(async (): Promise<boolean> => {
    if (busy) return false;
    const accepted = await explain();
    await AsyncStorage.setItem(OFFERED_KEY, '1').catch(() => undefined);
    if (!accepted) return false;

    setBusy(true);
    try {
      let foreground = await Location.getForegroundPermissionsAsync();
      if (!foreground.granted) {
        await requestLocationAccess();
        foreground = await Location.getForegroundPermissionsAsync();
      }
      if (!foreground.granted) return false;

      // The sheet above was the disclosure; this is the OS prompt it precedes.
      let background = await Location.getBackgroundPermissionsAsync();
      if (!background.granted && background.canAskAgain) {
        background = await Location.requestBackgroundPermissionsAsync();
      }
      if (!background.granted) {
        Alert.alert(
          'One more step',
          'Nearby ride alerts need location set to "Allow all the time". You can change it in your phone settings.',
          [
            { text: 'Not now', style: 'cancel' },
            { text: 'Open settings', onPress: () => void Linking.openSettings() },
          ],
        );
        return false;
      }

      const token = await getAccessTokenWithRetry(getAccessToken);
      if (!token) return false;
      await setDriverStandby({ accessToken: token, enabled: true });
      await AsyncStorage.removeItem(PENDING_OFF_KEY).catch(() => undefined);
      await setStandbyEnabledLocally(true);
      setEnabled(true);
      // Online drivers are already covered by the precise heartbeat; this
      // one starts when they go offline.
      if (!isOnline) await resumeStandbyIfEnabled(token);
      return true;
    } catch (error) {
      Alert.alert('Could not turn on alerts', error instanceof Error ? error.message : 'Please try again.');
      return false;
    } finally {
      setBusy(false);
    }
  }, [busy, explain, getAccessToken, isOnline, requestLocationAccess]);

  const turnOff = useCallback(async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    // Stop collecting first; the server call only tidies up what it already holds.
    await disableStandby();
    setEnabled(false);
    await AsyncStorage.setItem(PENDING_OFF_KEY, '1').catch(() => undefined);
    try {
      const token = await getAccessTokenWithRetry(getAccessToken);
      if (token) {
        await setDriverStandby({ accessToken: token, enabled: false });
        await AsyncStorage.removeItem(PENDING_OFF_KEY).catch(() => undefined);
      }
    } catch {
      // The phone has stopped sending, which is what matters. The marker above
      // makes the next launch tell the server again before trusting its answer.
    } finally {
      setBusy(false);
    }
  }, [busy, getAccessToken]);

  const toggle = useCallback(
    (next: boolean) => {
      void (next ? turnOn() : turnOff());
    },
    [turnOn, turnOff],
  );

  /** Show the explanation once, ever, to a driver who has not decided yet. */
  const offerOnce = useCallback(async (): Promise<void> => {
    if (enabled || !supported) return;
    if (await AsyncStorage.getItem(OFFERED_KEY).catch(() => '1')) return;
    await turnOn();
  }, [enabled, supported, turnOn]);

  const sheet = useMemo(
    () => (
      <Modal visible={visible} transparent animationType="slide" onRequestClose={() => settle(false)}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => settle(false)} accessibilityLabel="Close" />
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, theme.spacing.lg) + theme.spacing.md }]}>
            <AppText variant="h2" style={styles.title}>Hear about riders near you</AppText>
            <AppText variant="body" color={theme.colors.muted}>
              {"When a rider nearby can't find a driver, we can let you know — even if you're offline."}
            </AppText>

            <View style={styles.points}>
              <Point
                title="What we collect"
                body="Wheelers Driver collects your approximate location in the background, even when the app is closed or not in use, while you are signed in and offline."
              />
              <Point
                title="How often"
                body="A rough position about every 10 minutes — not the precise tracking used while you're online."
              />
              <Point
                title="What it's for"
                body="So our team can send you a ride alert or call you about a rider close by, and for your safety. It is never sold or shared with riders."
              />
              <Point
                title="You're in control"
                body="It never puts you online or accepts a ride for you. Turn it off any time in Settings and we delete your off-shift location."
              />
            </View>

            <Pressable
              onPress={() => settle(true)}
              style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
              accessibilityRole="button">
              <AppText variant="bodyMedium" color={theme.colors.white}>Turn on</AppText>
            </Pressable>
            <Pressable onPress={() => settle(false)} style={styles.secondary} accessibilityRole="button">
              <AppText variant="bodyMedium" color={theme.colors.muted}>Not now</AppText>
            </Pressable>
          </View>
        </View>
      </Modal>
    ),
    [insets.bottom, settle, visible],
  );

  return { enabled, supported, busy, toggle, turnOn, turnOff, offerOnce, sheet };
}

function Point({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.point}>
      <View style={styles.bullet} />
      <View style={styles.pointText}>
        <AppText variant="bodyMedium">{title}</AppText>
        <AppText variant="bodySmall" color={theme.colors.muted}>{body}</AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: theme.colors.offWhite,
    borderTopLeftRadius: theme.radii.xl,
    borderTopRightRadius: theme.radii.xl,
    borderWidth: theme.borders.thick,
    borderBottomWidth: 0,
    borderColor: theme.colors.black,
    paddingHorizontal: theme.spacing.gutter,
    paddingTop: theme.spacing.xl,
  },
  title: { marginBottom: theme.spacing.xs },
  points: { marginTop: theme.spacing.lg, gap: theme.spacing.md },
  point: { flexDirection: 'row', gap: theme.spacing.md, alignItems: 'flex-start' },
  bullet: {
    width: 12,
    height: 12,
    marginTop: 5,
    borderRadius: 6,
    backgroundColor: theme.colors.orange,
    borderWidth: 2,
    borderColor: theme.colors.black,
  },
  pointText: { flex: 1, gap: 2 },
  primary: {
    height: 52,
    marginTop: theme.spacing.xl,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.black,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    ...theme.shadows.card,
  },
  pressed: { transform: [{ translateX: 2 }, { translateY: 2 }] },
  secondary: { alignSelf: 'center', marginTop: theme.spacing.md, padding: theme.spacing.sm },
});
