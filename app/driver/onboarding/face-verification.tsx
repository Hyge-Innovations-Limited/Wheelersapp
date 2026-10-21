import { useEffect, useRef, useState } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";

import { AppButton } from "@/components/app-button";
import { AppScreen } from "@/components/app-screen";
import { AppText, OnLight } from "@/components/app-text";
import { FlowHeader } from "@/components/flow-header";
import { useResponsive } from "@/lib/responsive";
import { theme } from "@/theme";
import { useDriverOnboarding } from "@/lib/driver-onboarding";
import { useKycStep } from "@/lib/use-kyc-step";

/** What makes a selfie usable, shown under the camera. */
const TIPS: { icon: keyof typeof Ionicons.glyphMap; text: string }[] = [
  { icon: "phone-portrait-outline", text: "Hold your phone at eye level" },
  { icon: "scan-outline", text: "Your whole face inside the oval" },
  { icon: "sunny-outline", text: "Good light, no cap or sunglasses" },
];

/**
 * The driver's selfie. The driver takes it themselves and looks at it before
 * it is used: nothing is snapped on a timer. A photo used to be taken by
 * itself after ten seconds of timed prompts ("Blink", "Turn your head"),
 * whatever the camera was pointing at, and called "Verification complete":
 * drivers sent the sky or a ceiling without ever seeing it.
 *
 * The front camera only, never the gallery. Coming back to this step shows
 * the photo already taken, to keep or retake.
 */
export default function FaceVerificationScreen() {
  const responsive = useResponsive();
  const step = useKycStep("selfie");
  const { data, setSelfieUri } = useDriverOnboarding();
  const [permission, requestPermission] = useCameraPermissions();
  // The photo being looked at: a fresh one, or the one already kept.
  const [photoUri, setPhotoUri] = useState<string | null>(data.selfieUri);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraKey, setCameraKey] = useState(0);
  const [taking, setTaking] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      void requestPermission();
    }
  }, [permission, requestPermission]);

  async function takePhoto() {
    if (taking) return;
    if (!cameraRef.current || !cameraReady) {
      setCameraError("The camera isn't ready yet. Try again in a moment.");
      return;
    }
    setTaking(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.7 });
      if (photo?.uri) setPhotoUri(photo.uri);
      else setCameraError("The photo didn't save. Try again.");
    } catch {
      setCameraError("Your camera couldn't take the photo. Try again.");
    } finally {
      setTaking(false);
    }
  }

  /** Back to the camera, fresh. */
  function retake() {
    setPhotoUri(null);
    setCameraError(null);
    setCameraReady(false);
    setCameraKey((k) => k + 1);
  }

  /** Keep this photo and move on (or send, when it is the last step). */
  function usePhoto() {
    if (!photoUri) return;
    setSelfieUri(photoUri);
    void step.go({ selfieUri: photoUri });
  }

  if (!permission?.granted) {
    return (
      <AppScreen contentStyle={styles.container}>
        <FlowHeader title="Face check" subtitle="Camera access is needed" showBack progress={step.progress} />
        <View style={styles.center}>
          <Ionicons name="camera-outline" size={40} color={theme.colors.muted} />
          <AppText variant="body" color={theme.colors.muted} style={styles.centerText}>
            {"We use your front camera for one photo of your face. It is only used to check it's you."}
          </AppText>
        </View>
        <AppButton title="Allow camera" onPress={requestPermission} />
      </AppScreen>
    );
  }

  // The frame takes whatever height is left after the header, tips and buttons,
  // capped to 3:4, so it shrinks on a small phone instead of pushing the buttons off.
  const frameHeight = responsive.vh(46, 240, 460);
  const guideHeight = Math.round(frameHeight * 0.7);
  const reviewing = photoUri !== null;

  return (
    <AppScreen scroll contentStyle={styles.container}>
      <FlowHeader
        title="Face check"
        subtitle={reviewing ? "Check your photo before you use it" : cameraError ? "Let's try that again" : "Take a clear photo of your face"}
        showBack
        progress={step.progress}
      />

      <View style={[styles.section, { gap: responsive.scale(16) }]}>
        <View style={[styles.frame, { height: frameHeight, maxWidth: Math.round(frameHeight * 0.75) }]}>
          {reviewing ? (
            // Shown mirrored, as the driver saw themselves in the camera; the photo itself is sent as taken.
            <Image source={{ uri: photoUri }} style={[styles.fill, styles.mirrored]} resizeMode="cover" accessibilityLabel="Your photo" />
          ) : (
            <>
              <CameraView
                key={cameraKey}
                ref={cameraRef}
                style={styles.fill}
                facing="front"
                mode="picture"
                onCameraReady={() => setCameraReady(true)}
                onMountError={() => setCameraError("Your camera didn't start. Close any other app using it, then try again.")}
              />
              <View style={styles.overlay} pointerEvents="none">
                <View
                  style={[
                    styles.faceGuide,
                    { height: guideHeight, width: Math.round(guideHeight * 0.77), borderRadius: Math.round(guideHeight * 0.4) },
                  ]}
                />
              </View>
            </>
          )}
        </View>

        {cameraError && !reviewing ? (
          <View style={styles.errorWrap}>
            <Ionicons name="alert-circle" size={28} color={theme.colors.danger} />
            <AppText variant="body" style={styles.centerText}>
              {cameraError}
            </AppText>
            <AppButton title="Try again" variant="ghost" onPress={retake} />
          </View>
        ) : null}

        {reviewing ? (
          <View style={styles.tips}>
            <AppText variant="h3" style={styles.centerText}>
              Is your face clear?
            </AppText>
            <AppText variant="bodySmall" color={theme.colors.muted} style={styles.centerText}>
              Your whole face, not blurry or dark. If not, take it again.
            </AppText>
          </View>
        ) : !cameraError ? (
          <View style={styles.tips}>
            {TIPS.map((tip) => (
              <View key={tip.text} style={styles.tipRow}>
                <Ionicons name={tip.icon} size={18} color={theme.colors.muted} />
                <AppText variant="bodySmall" color={theme.colors.muted}>
                  {tip.text}
                </AppText>
              </View>
            ))}
          </View>
        ) : null}

        {!reviewing && !cameraError ? (
          cameraReady ? (
            <View style={styles.shutterWrap}>
              <Pressable
                onPress={() => void takePhoto()}
                disabled={taking}
                accessibilityRole="button"
                accessibilityLabel="Take photo"
                style={({ pressed }) => [styles.shutter, (pressed || taking) && styles.shutterPressed]}>
                <OnLight>
                  <View style={styles.shutterInner}>
                    <Ionicons name="camera" size={28} color={theme.colors.white} />
                  </View>
                </OnLight>
              </Pressable>
              <AppText variant="bodySmall" color={theme.colors.muted}>
                {taking ? "Taking photo…" : "Tap to take the photo"}
              </AppText>
            </View>
          ) : (
            <AppText variant="bodySmall" color={theme.colors.muted}>
              Starting your camera…
            </AppText>
          )
        ) : null}
      </View>

      <View style={styles.spacer} />

      {reviewing ? (
        <View style={styles.actions}>
          <AppButton
            title={step.isLast ? (step.fixing ? "Use photo and send" : "Use photo and submit") : "Use this photo"}
            onPress={usePhoto}
            loading={step.submitting}
          />
          <AppButton title="Retake" variant="ghost" onPress={retake} disabled={step.submitting} />
        </View>
      ) : null}
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
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
  },
  centerText: {
    textAlign: "center",
  },
  section: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: theme.spacing.lg,
  },
  frame: {
    width: "90%",
    alignSelf: "center",
    borderRadius: theme.radius.lg,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.borderLight,
    overflow: "hidden",
    ...theme.shadows.card,
  },
  fill: {
    flex: 1,
  },
  mirrored: {
    transform: [{ scaleX: -1 }],
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
  tips: {
    alignItems: "center",
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.lg,
  },
  tipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  shutterWrap: {
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.white,
    alignItems: "center",
    justifyContent: "center",
    ...theme.shadows.card,
  },
  shutterPressed: {
    transform: [{ scale: 0.92 }],
    shadowOpacity: 0,
    elevation: 0,
  },
  shutterInner: {
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
  actions: {
    gap: theme.spacing.sm,
  },
  spacer: {
    flexGrow: 1,
    minHeight: theme.spacing.xl,
  },
});
