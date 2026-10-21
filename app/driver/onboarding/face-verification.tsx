import { useEffect, useRef, useState } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { AppButton } from "@/components/app-button";
import { AppScreen } from "@/components/app-screen";
import { AppText, OnLight } from "@/components/app-text";
import { FlowHeader } from "@/components/flow-header";
import { useResponsive } from "@/lib/responsive";
import { theme } from "@/theme";
import { useDriverOnboarding } from "@/lib/driver-onboarding";
import { useKycStep } from "@/lib/use-kyc-step";
import { faceCheck, PROMPTS, readFrame, START, STEPS, stepsDone, type CheckState, type SelfieCheck } from "@/lib/face-check";

/** What makes a selfie usable, shown under the camera when there is no face check. */
const TIPS: { icon: keyof typeof Ionicons.glyphMap; text: string }[] = [
  { icon: "phone-portrait-outline", text: "Hold your phone at eye level" },
  { icon: "scan-outline", text: "Your whole face inside the oval" },
  { icon: "sunny-outline", text: "Good light, no cap or sunglasses" },
];

/** A prompt not done in this long gets a hint, and counts as a miss. */
const STUCK_MS = 20_000;
/** After this many misses the driver may go on without the check (the photo is marked for the reviewer). */
const MISSES_BEFORE_SKIP = 3;
/** Frame reads that fail in a row before the check is given up on this phone. */
const ERRORS_BEFORE_GIVING_UP = 4;

const STUCK_HINTS: Record<string, string> = {
  straight: "Hold the phone at eye level, face in the oval, in good light",
  close_eyes: "Close both eyes fully for a second",
  open_eyes: "Open your eyes and look at the screen",
  turn_one: "Turn your head slowly, as if looking over your shoulder",
  turn_other: "Now turn the other way, past the middle",
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The driver's selfie, taken by the driver and looked at before it is used.
 *
 * With the face check (modules/face-check, in builds that have it) the phone
 * watches a few frames a second and the prompts move on only when the driver
 * really does them: look straight, close then open the eyes, turn one way then
 * the other (lib/face-check.ts). The oval turns green and the shutter lights
 * up only then, and only while they look straight. A driver stuck three times
 * may go on without it; that photo is marked for the reviewer.
 *
 * Without it (older builds, or a phone where it fails), the driver takes the
 * photo with the tips shown and looks at it, as before.
 *
 * Front camera only, never the gallery. Coming back to this step shows the
 * photo already taken, to keep or retake.
 */
export default function FaceVerificationScreen() {
  const responsive = useResponsive();
  const step = useKycStep("selfie");
  const { data, setSelfieUri } = useDriverOnboarding();
  const [permission, requestPermission] = useCameraPermissions();
  const checker = faceCheck();

  const [photoUri, setPhotoUri] = useState<string | null>(data.selfieUri);
  const [photoCheck, setPhotoCheck] = useState<SelfieCheck | null>(data.selfieCheck);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraKey, setCameraKey] = useState(0);
  const [taking, setTaking] = useState(false);
  const [pictureSize, setPictureSize] = useState<string | undefined>(undefined);
  const cameraRef = useRef<CameraView>(null);

  // The face check: on unless this build has none, the phone could not run it, or the driver went on without it.
  const [checking, setChecking] = useState(checker !== null);
  const [without, setWithout] = useState<SelfieCheck>("unavailable");
  const [check, setCheck] = useState<CheckState>(START);
  const [hint, setHint] = useState<string | null>(null);
  // The clearer words after being stuck on a prompt: kept until that prompt is done (frames would overwrite `hint`).
  const [stuckHint, setStuckHint] = useState<string | null>(null);
  const [canShoot, setCanShoot] = useState(false);
  const [misses, setMisses] = useState(0);
  const checkRef = useRef<CheckState>(START);
  const pausedRef = useRef(false);
  const frameRef = useRef<Promise<unknown> | null>(null);

  const reviewing = photoUri !== null;

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      void requestPermission();
    }
  }, [permission, requestPermission]);

  // A few frames a second while the camera is open: each one moves the prompts on, or says what is off.
  useEffect(() => {
    if (!checking || !checker || reviewing || !cameraReady || cameraError) return;
    let alive = true;
    let errors = 0;
    void (async () => {
      while (alive) {
        if (pausedRef.current || !cameraRef.current) {
          await sleep(150);
          continue;
        }
        const read = (async () => {
          const picture = await cameraRef.current!.takePictureAsync({ quality: 0.3, skipProcessing: true, shutterSound: false });
          if (!picture?.uri) throw new Error("no frame");
          return checker.detect(picture.uri, true);
        })();
        frameRef.current = read;
        try {
          const frame = await read;
          errors = 0;
          if (!alive) break;
          const before = checkRef.current.prompt;
          const out = readFrame(checkRef.current, frame);
          checkRef.current = out.state;
          setCheck(out.state);
          setHint(out.hint);
          setCanShoot(out.canShoot);
          if (out.state.prompt !== before) {
            setStuckHint(null);
            void Haptics.selectionAsync().catch(() => undefined);
          }
        } catch {
          errors += 1;
          if (errors >= ERRORS_BEFORE_GIVING_UP && alive) {
            // This phone cannot run it: the photo is taken by hand, marked as without the check.
            setWithout("unavailable");
            setChecking(false);
            break;
          }
        } finally {
          frameRef.current = null;
        }
        await sleep(120);
      }
    })();
    return () => {
      alive = false;
    };
  }, [checking, checker, reviewing, cameraReady, cameraError]);

  // A prompt not done for a while: a clearer hint, and a miss.
  useEffect(() => {
    if (!checking || reviewing || !cameraReady || check.prompt === "ready") return;
    const timer = setTimeout(() => {
      setMisses((n) => n + 1);
      setStuckHint(STUCK_HINTS[check.prompt] ?? null);
    }, STUCK_MS);
    return () => clearTimeout(timer);
  }, [checking, reviewing, cameraReady, check.prompt, misses]);

  async function takePhoto() {
    if (taking) return;
    if (!cameraRef.current || !cameraReady) {
      setCameraError("The camera isn't ready yet. Try again in a moment.");
      return;
    }
    setTaking(true);
    // The frame being read finishes first: the camera takes one picture at a time.
    pausedRef.current = true;
    await frameRef.current?.catch(() => undefined);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.7 });
      if (photo?.uri) {
        setPhotoUri(photo.uri);
        setPhotoCheck(checking ? "passed" : without);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      } else {
        setCameraError("The photo didn't save. Try again.");
      }
    } catch {
      setCameraError("Your camera couldn't take the photo. Try again.");
    } finally {
      pausedRef.current = false;
      setTaking(false);
    }
  }

  /**
   * About 1280 px on the long side, when the camera offers it: a 12 MP frame a
   * few times a second makes a cheap phone slow, and 1280 is plenty for a selfie.
   * Otherwise the camera's own default.
   */
  async function choosePictureSize() {
    try {
      const sizes = (await cameraRef.current?.getAvailablePictureSizesAsync()) ?? [];
      const sized = sizes
        .map((size) => {
          const [w, h] = size.split("x").map(Number);
          return { size, long: Math.max(w || 0, h || 0) };
        })
        .filter((s) => s.long >= 960 && s.long <= 1920)
        .sort((a, b) => Math.abs(a.long - 1280) - Math.abs(b.long - 1280));
      setPictureSize(sized[0]?.size ?? "");
    } catch {
      setPictureSize("");
    }
  }

  /** Back to the camera, fresh. Prompts already done stay done: they were done moments ago, by this face. */
  function retake() {
    setPhotoUri(null);
    setPhotoCheck(null);
    setCameraError(null);
    setCameraReady(false);
    setCanShoot(false);
    setCameraKey((k) => k + 1);
  }

  /** On without the face check: the driver takes the photo by hand; it is marked for the reviewer. */
  function goOnWithout() {
    setWithout("skipped");
    setChecking(false);
    setHint(null);
    setStuckHint(null);
  }

  /** Keep this photo and move on (or send, when it is the last step). */
  function usePhoto() {
    if (!photoUri) return;
    const how = photoCheck ?? without;
    setSelfieUri(photoUri, how);
    void step.go({ selfieUri: photoUri, selfieCheck: how });
  }

  if (!permission?.granted) {
    return (
      <AppScreen contentStyle={styles.container}>
        <FlowHeader title="Face check" subtitle="Camera access is needed" showBack progress={step.progress} />
        <View style={styles.center}>
          <Ionicons name="camera-outline" size={40} color={theme.colors.muted} />
          <AppText variant="body" color={theme.colors.muted} style={styles.centerText}>
            {"We use your front camera to check it's you, and for one photo of your face."}
          </AppText>
        </View>
        <AppButton title="Allow camera" onPress={requestPermission} />
      </AppScreen>
    );
  }

  // The frame takes whatever height is left after the header, prompts and buttons,
  // capped to 3:4, so it shrinks on a small phone instead of pushing the buttons off.
  const frameHeight = responsive.vh(46, 240, 460);
  const guideHeight = Math.round(frameHeight * 0.7);
  const done = stepsDone(check.prompt);
  const shutterOn = cameraReady && !taking && (!checking || canShoot);
  const subtitle = reviewing
    ? "Check your photo before you use it"
    : cameraError
      ? "Let's try that again"
      : checking
        ? "Follow the prompts so we know it's really you"
        : "Take a clear photo of your face";

  return (
    <AppScreen scroll contentStyle={styles.container}>
      <FlowHeader title="Face check" subtitle={subtitle} showBack progress={step.progress} />

      <View style={[styles.section, { gap: responsive.scale(14) }]}>
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
                pictureSize={pictureSize || undefined}
                onCameraReady={() => {
                  setCameraReady(true);
                  if (pictureSize === undefined) void choosePictureSize();
                }}
                onMountError={() => setCameraError("Your camera didn't start. Close any other app using it, then try again.")}
              />
              <View style={styles.overlay} pointerEvents="none">
                <View
                  style={[
                    styles.faceGuide,
                    checking && canShoot && styles.faceGuideReady,
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
        ) : cameraError ? null : checking ? (
          <View style={styles.tips}>
            <View style={styles.stepRow} accessibilityLabel={`${done} of ${STEPS.length} steps done`}>
              {STEPS.map((s, index) => {
                const ok = index < done;
                const now = index === done;
                return (
                  <View key={s.key} style={[styles.stepPill, ok && styles.stepPillDone, now && styles.stepPillNow]}>
                    {ok ? <Ionicons name="checkmark" size={14} color={theme.colors.white} /> : null}
                    <AppText variant="caption" color={ok ? theme.colors.white : now ? theme.colors.black : theme.colors.muted}>
                      {s.label}
                    </AppText>
                  </View>
                );
              })}
            </View>
            {cameraReady ? (
              <>
                <AppText variant="h3" style={styles.centerText} accessibilityLiveRegion="polite">
                  {PROMPTS[check.prompt]}
                </AppText>
                <AppText variant="bodySmall" color={hint || stuckHint ? theme.colors.orange : theme.colors.muted} style={styles.centerText}>
                  {hint ?? stuckHint ?? (check.prompt === "ready" ? "All done. Hold still and tap the button." : " ")}
                </AppText>
              </>
            ) : (
              <AppText variant="bodySmall" color={theme.colors.muted}>
                Starting your camera…
              </AppText>
            )}
          </View>
        ) : (
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
        )}

        {!reviewing && !cameraError && cameraReady ? (
          <View style={styles.shutterWrap}>
            <Pressable
              onPress={() => void takePhoto()}
              disabled={!shutterOn}
              accessibilityRole="button"
              accessibilityLabel="Take photo"
              accessibilityState={{ disabled: !shutterOn }}
              style={({ pressed }) => [styles.shutter, !shutterOn && styles.shutterOff, (pressed || taking) && styles.shutterPressed]}>
              <OnLight>
                <View style={[styles.shutterInner, !shutterOn && styles.shutterInnerOff]}>
                  <Ionicons name="camera" size={28} color={theme.colors.white} />
                </View>
              </OnLight>
            </Pressable>
            <AppText variant="bodySmall" color={theme.colors.muted}>
              {taking ? "Taking photo…" : shutterOn ? "Tap to take the photo" : "Finish the steps first"}
            </AppText>
            {checking && misses >= MISSES_BEFORE_SKIP && check.prompt !== "ready" ? (
              <AppButton title="Continue without the face check" variant="ghost" onPress={goOnWithout} />
            ) : null}
          </View>
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
  faceGuideReady: {
    borderWidth: 4,
    borderColor: theme.colors.green,
    borderStyle: "solid",
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
  stepRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 6,
    marginBottom: theme.spacing.xs,
  },
  stepPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: theme.colors.borderLight,
  },
  stepPillNow: {
    borderColor: theme.colors.orange,
  },
  stepPillDone: {
    backgroundColor: theme.colors.green,
    borderColor: theme.colors.green,
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
  shutterOff: {
    opacity: 0.5,
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
  shutterInnerOff: {
    backgroundColor: theme.colors.muted,
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
