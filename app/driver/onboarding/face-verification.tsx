import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";

import { Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { AppButton } from "@/components/app-button";
import { AppScreen } from "@/components/app-screen";
import { AppText } from "@/components/app-text";
import { FlowHeader } from "@/components/flow-header";
import { useResponsive } from "@/lib/responsive";
import { theme } from "@/theme";
import { useDriverOnboarding } from "@/lib/driver-onboarding";
import { useKycStep } from "@/lib/use-kyc-step";

type Challenge = "center" | "blink" | "turn_left" | "turn_right";

const CHALLENGES: { key: Challenge; instruction: string }[] = [
  { key: "center", instruction: "Look straight at the camera" },
  { key: "blink", instruction: "Blink slowly" },
  { key: "turn_left", instruction: "Turn your head left" },
  { key: "turn_right", instruction: "Turn your head right" },
];

export default function FaceVerificationScreen() {
  const responsive = useResponsive();
  const step = useKycStep("selfie");
  const { setSelfieUri } = useDriverOnboarding();
  const [permission, requestPermission] = useCameraPermissions();
  const [currentStep, setCurrentStep] = useState(0);
  const [captured, setCaptured] = useState(false);
  // The prompts only run once the camera is really on, and "captured" means a
  // photo exists: a camera that failed used to pass as done, and the driver
  // only found out when sending failed at the very end.
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraKey, setCameraKey] = useState(0);
  const capturingRef = useRef(false);
  const cameraRef = useRef<CameraView>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const challenge = CHALLENGES[currentStep];

  useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
    }
  }, [permission]);

  useEffect(() => {
    // Auto-advance through challenges every 2.5s (simulating liveness detection)
    if (captured || cameraError || !cameraReady || !permission?.granted) return;

    timerRef.current = setTimeout(() => {
      if (currentStep < CHALLENGES.length - 1) {
        setCurrentStep((s) => s + 1);
      } else {
        handleCapture();
      }
    }, 2500);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [currentStep, captured, cameraError, cameraReady, permission?.granted]);

  async function handleCapture() {
    if (capturingRef.current) return;
    if (!cameraRef.current || !cameraReady) {
      setCameraError("The camera isn't ready yet. Try again in a moment.");
      return;
    }

    capturingRef.current = true;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.7 });
      if (photo?.uri) {
        setSelfieUri(photo.uri);
        setCaptured(true);
      } else {
        setCameraError("The photo didn't save. Try again.");
      }
    } catch {
      setCameraError("Your camera couldn't take the photo. Try again.");
    } finally {
      capturingRef.current = false;
    }
  }

  /** Starts the check again with a fresh camera. */
  function retry() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setCameraError(null);
    setCaptured(false);
    setCurrentStep(0);
    setCameraReady(false);
    setCameraKey((k) => k + 1);
  }

  if (!permission?.granted) {
    return (
      <AppScreen contentStyle={styles.container}>
        <FlowHeader
          title="Face Verification"
          subtitle="Camera permission is required"
          showBack
          progress={step.progress}
        />
        <View style={styles.center}>
          <AppText variant="body" color={theme.colors.muted}>
            Please allow camera access to continue
          </AppText>
        </View>
        <AppButton title="Allow Camera" onPress={requestPermission} />
      </AppScreen>
    );
  }

  // The preview takes whatever height is left after header, prompts and CTA,
  // capped to a 3:4 frame — so it shrinks on an SE instead of pushing the
  // Continue button off screen.
  const cameraHeight = responsive.vh(46, 240, 460);
  const guideHeight = Math.round(cameraHeight * 0.7);

  return (
    <AppScreen scroll contentStyle={styles.container}>
      <FlowHeader
        title="Face Verification"
        subtitle={captured ? "Looking good!" : cameraError ? "Let's try that again" : "Follow the prompts below"}
        showBack
        progress={step.progress}
      />

      <View style={[styles.cameraSection, { gap: responsive.scale(16) }]}>
        <View style={[styles.cameraWrap, { height: cameraHeight, maxWidth: Math.round(cameraHeight * 0.75) }]}>
          <CameraView
            key={cameraKey}
            ref={cameraRef}
            style={styles.camera}
            facing="front"
            mode="picture"
            onCameraReady={() => setCameraReady(true)}
            onMountError={() => setCameraError("Your camera didn't start. Close any other app using it, then try again.")}
          />
          <View style={styles.overlay}>
            <View
              style={[
                styles.faceGuide,
                {
                  height: guideHeight,
                  width: Math.round(guideHeight * 0.77),
                  borderRadius: Math.round(guideHeight * 0.4),
                },
              ]}
            />
          </View>
        </View>

        {cameraError && (
          <View style={styles.errorWrap}>
            <Ionicons name="alert-circle" size={28} color={theme.colors.danger} />
            <AppText variant="body" style={styles.instruction}>
              {cameraError}
            </AppText>
            <AppButton title="Try again" variant="ghost" onPress={retry} />
          </View>
        )}

        {!captured && !cameraError && challenge && (
          cameraReady ? (
          <View style={styles.instructionWrap}>
            <AppText variant="h3" style={styles.instruction}>
              {challenge.instruction}
            </AppText>
            <AppText variant="bodySmall" color={theme.colors.muted}>
              Step {currentStep + 1} of {CHALLENGES.length}
            </AppText>
          </View>
          ) : (
            <AppText variant="bodySmall" color={theme.colors.muted}>
              Starting your camera…
            </AppText>
          )
        )}

        {!captured && !cameraError && cameraReady && (
          <Pressable
            onPress={handleCapture}
            style={({ pressed }) => [
              styles.captureButton,
              pressed && styles.capturePressed,
            ]}
          >
            <View style={styles.captureInner}>
              <Ionicons name="camera" size={28} color={theme.colors.white} />
            </View>
          </Pressable>
        )}

        {captured && (
          <View style={styles.successWrap}>
            <Ionicons name="checkmark-circle" size={32} color={theme.colors.green} />
            <AppText variant="h3" color={theme.colors.green}>
              Verification complete
            </AppText>
          </View>
        )}
      </View>

      <View style={styles.spacer} />

      <AppButton
        title={step.buttonTitle}
        onPress={() => void step.go()}
        disabled={!captured}
        loading={step.submitting}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: theme.spacing.xxxl,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  cameraSection: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: theme.spacing.lg,
  },
  cameraWrap: {
    width: "90%",
    alignSelf: "center",
    borderRadius: theme.radius.lg,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    overflow: "hidden",
    ...theme.shadows.card,
  },
  camera: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  faceGuide: {
    borderWidth: 2.5,
    borderColor: theme.colors.orange,
    borderStyle: "dashed",
  },
  instructionWrap: {
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  instruction: {
    textAlign: "center",
  },
  captureButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.white,
    alignItems: "center",
    justifyContent: "center",
    ...theme.shadows.card,
  },
  capturePressed: {
    transform: [{ scale: 0.92 }],
    shadowOpacity: 0,
    elevation: 0,
  },
  captureInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.orange,
    alignItems: "center",
    justifyContent: "center",
  },
  errorWrap: {
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
  },
  successWrap: {
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  spacer: {
    flexGrow: 1,
    minHeight: theme.spacing.xl,
  },
});
