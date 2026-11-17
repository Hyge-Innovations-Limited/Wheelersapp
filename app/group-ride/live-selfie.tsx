import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Image, Linking, Pressable, StyleSheet, View } from "react-native";

import { RButton, RScreen, RText, rider } from "@/components/rider/kit";
import { getAccessTokenWithRetry } from "@/lib/access-token";
import { sendGroupSelfie } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const { colors, fonts } = rider;

/**
 * The group ride selfie (Timi, 17 Nov 2026): taken once, then reused for every group ride. The front camera, one
 * photo, the same face check on the server; a photo that is not a face is refused with why. Back to the search when
 * it is saved (the group may form at once).
 */
export default function GroupLiveSelfieScreen() {
  const router = useRouter();
  const { getAccessToken } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [photo, setPhoto] = useState<{ uri: string; base64: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function take() {
    setError(null);
    const pic = await camera.current?.takePictureAsync({ quality: 0.5, base64: true, shutterSound: false }).catch(() => null);
    if (!pic?.uri || !pic.base64) {
      setError("Could not take the photo. Try again.");
      return;
    }
    setPhoto({ uri: pic.uri, base64: pic.base64 });
  }

  async function send() {
    if (!photo || busy) return;
    setBusy(true);
    setError(null);
    try {
      const token = await getAccessTokenWithRetry(getAccessToken);
      if (!token) throw new Error("Please sign in again.");
      await sendGroupSelfie(token, photo.base64, "image/jpeg");
      router.back();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not save your selfie. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!permission) return <RScreen contentStyle={styles.page}><View /></RScreen>;
  if (!permission.granted) {
    return (
      <RScreen contentStyle={styles.page}>
        <RText variant="title">One selfie for group rides</RText>
        <RText color={colors.muted}>Allow the camera to take it.</RText>
        <RButton onPress={() => (permission.canAskAgain ? void requestPermission() : void Linking.openSettings())} title="Allow camera" />
        <RButton onPress={() => router.back()} title="Not now" variant="ghost" />
      </RScreen>
    );
  }

  return (
    <RScreen contentStyle={styles.page}>
      <View style={styles.words}>
        <RText variant="title">One selfie for group rides</RText>
        <RText color={colors.muted}>{"Wheelers checks it's you. You only do this once."}</RText>
      </View>
      <View style={styles.frame}>
        {photo ? (
          <Image accessibilityLabel="Your selfie" source={{ uri: photo.uri }} style={StyleSheet.absoluteFill} />
        ) : (
          <CameraView facing="front" ref={camera} style={StyleSheet.absoluteFill} />
        )}
        <View pointerEvents="none" style={styles.oval} />
      </View>
      {error ? <RText accessibilityLiveRegion="polite" color={colors.danger} style={styles.error}>{error}</RText> : null}
      {photo ? (
        <>
          <RButton loading={busy} onPress={() => void send()} title="Use this selfie" />
          <RButton disabled={busy} onPress={() => setPhoto(null)} title="Take another" variant="ghost" />
        </>
      ) : (
        <Pressable accessibilityLabel="Take the selfie" accessibilityRole="button" onPress={() => void take()} style={styles.shutter}>
          <View style={styles.shutterInner} />
        </Pressable>
      )}
    </RScreen>
  );
}

const styles = StyleSheet.create({
  page: { paddingTop: 16, gap: 16, flexGrow: 1 },
  words: { gap: 6 },
  frame: { flex: 1, minHeight: 360, borderRadius: 26, overflow: "hidden", backgroundColor: "#19150F", alignItems: "center", justifyContent: "center" },
  oval: { width: 220, height: 280, borderRadius: 140, borderWidth: 3, borderColor: colors.orange },
  error: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18 },
  shutter: { alignSelf: "center", width: 74, height: 74, borderRadius: 37, borderWidth: 4, borderColor: colors.ink, alignItems: "center", justifyContent: "center", backgroundColor: colors.cream },
  shutterInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.orange },
});
