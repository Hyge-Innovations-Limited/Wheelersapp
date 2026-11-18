import { useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Href, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { AppButton } from '@/components/app-button';
import { AppScreen } from '@/components/app-screen';
import { AppText } from '@/components/app-text';
import { getAccessTokenWithRetry } from '@/lib/access-token';
import { sendFaceScan } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { parseFaceScanAnswer, SCAN_STEPS, secondsLeft, stepWords, type ScanStep } from '@/lib/driver-face-check';
import { useDriverSession } from '@/lib/driver-session';
import { useResponsive } from '@/lib/responsive';
import { theme } from '@/theme';

const STEP_MS = 1600;

type Phase = { kind: 'idle' } | { kind: 'step'; step: ScanStep } | { kind: 'sending' } | { kind: 'retry'; reason: string };

/**
 * The face check before every ride (Timi, 18 Nov 2026): look at the camera, turn the way it says, look again.
 * Three photos go to the server, which checks them against the driver's Wheelers photo. Passed: back to the trip.
 */
export default function DriverFaceCheckScreen() {
  const router = useRouter();
  const responsive = useResponsive();
  const { getAccessToken } = useAuth();
  const { session, faceScanResult } = useDriverSession();
  const ride = session.currentRide;
  const check = ride?.faceCheck;
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [now, setNow] = useState(Date.now());
  const running = useRef(false);

  // Passed (here or by the socket), or the ride is gone: back to the trip.
  useEffect(() => {
    if (!ride) router.replace('/driver/(tabs)/home' as Href);
    else if (!check) router.replace('/driver/navigation' as Href);
  }, [ride, check, router]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) void requestPermission();
  }, [permission, requestPermission]);

  if (!ride || !check) return null;
  const rideId = ride.rideId;
  const left = secondsLeft(check.deadlineAt, now);

  async function scan() {
    if (running.current || !camera.current || !ready || !check) return;
    running.current = true;
    const frames: string[] = [];
    try {
      for (const step of SCAN_STEPS) {
        setPhase({ kind: 'step', step });
        await new Promise((resolve) => setTimeout(resolve, STEP_MS));
        const pic = await camera.current?.takePictureAsync({ quality: 0.4, base64: true, shutterSound: false }).catch(() => null);
        if (!pic?.base64) {
          setPhase({ kind: 'retry', reason: "The camera didn't take the photo. Try again." });
          return;
        }
        frames.push(pic.base64);
        void Haptics.selectionAsync().catch(() => undefined);
      }
      setPhase({ kind: 'sending' });
      const token = await getAccessTokenWithRetry(getAccessToken);
      if (!token) throw new Error('Sign in again.');
      const answer = parseFaceScanAnswer(await sendFaceScan(token, rideId, frames));
      if (answer.status === 'retry') {
        setPhase({ kind: 'retry', reason: answer.reason });
      } else {
        if (answer.status === 'passed') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        setPhase({ kind: 'idle' });
      }
      // Passed: the trip goes on. Over: the session says why and the ride goes (the screen follows).
      faceScanResult(rideId, answer);
    } catch (error) {
      setPhase({ kind: 'retry', reason: error instanceof Error ? error.message : 'Could not send the scan. Try again.' });
    } finally {
      running.current = false;
    }
  }

  if (!permission) return <AppScreen contentStyle={styles.page}><View /></AppScreen>;
  if (!permission.granted) {
    return (
      <AppScreen contentStyle={styles.page}>
        <AppText variant="h2">Face check</AppText>
        <AppText variant="body" color={theme.colors.muted}>Allow the camera to scan your face before the trip.</AppText>
        <AppButton title="Allow camera" onPress={() => (permission.canAskAgain ? void requestPermission() : void Linking.openSettings())} />
      </AppScreen>
    );
  }

  const frameHeight = responsive.vh(52, 260, 500);
  const step = phase.kind === 'step' ? phase.step : null;
  const title = step ? stepWords(step, check.challenge) : phase.kind === 'sending' ? 'Checking…' : 'Face check';
  const busy = phase.kind === 'step' || phase.kind === 'sending';

  return (
    <AppScreen contentStyle={styles.page}>
      <View style={styles.head}>
        <AppText accessibilityLiveRegion="polite" variant="h2">{title}</AppText>
        <AppText variant="bodySmall" color={left <= 30 ? theme.colors.danger : theme.colors.muted}>
          {`${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} left`}
        </AppText>
      </View>

      <View style={[styles.frame, { height: frameHeight, maxWidth: Math.round(frameHeight * 0.75) }]}>
        <CameraView
          ref={camera}
          style={styles.fill}
          facing="front"
          mode="picture"
          animateShutter={false}
          onCameraReady={() => setReady(true)}
          onMountError={() => setPhase({ kind: 'retry', reason: "Your camera didn't start. Close any other app using it." })}
        />
        {step === 'turn' ? (
          <View pointerEvents="none" style={styles.overlay}>
            <Ionicons color={theme.colors.white} name={check.challenge === 'left' ? 'arrow-back' : 'arrow-forward'} size={64} />
          </View>
        ) : null}
      </View>

      {phase.kind === 'retry' ? (
        <AppText style={styles.center} variant="body">{phase.reason}</AppText>
      ) : !busy ? (
        <AppText style={styles.center} variant="bodySmall" color={theme.colors.muted}>Phone at eye level, good light.</AppText>
      ) : null}

      <AppButton
        disabled={!ready || busy || left === 0}
        loading={phase.kind === 'sending'}
        onPress={() => void scan()}
        title={phase.kind === 'retry' ? 'Scan again' : 'Scan my face'}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  page: { gap: theme.spacing.lg, paddingTop: theme.spacing.xxxl },
  head: { gap: theme.spacing.xs, alignItems: 'center' },
  center: { textAlign: 'center' },
  frame: {
    width: '90%',
    alignSelf: 'center',
    borderRadius: theme.radius.lg,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.borderLight,
    overflow: 'hidden',
  },
  fill: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(13,13,13,0.25)' },
});
