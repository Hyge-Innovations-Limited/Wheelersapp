import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, OnLight } from '@/components/app-text';
import { getAccessTokenWithRetry } from '@/lib/access-token';
import { useAuth } from '@/lib/auth';
import { toUserMessage } from '@/lib/error-messages';
import { charCount, FEED_PHOTOS_MAX, FEED_TEXT_MAX } from '@/lib/feed';
import { createPost, markFeedChanged } from '@/lib/feed-api';
import { useAppTheme } from '@/lib/theme-context';
import { theme } from '@/theme';

/** The server takes up to 12 MB a photo; anything bigger is turned away here, before a slow upload. */
const MAX_PHOTO_BYTES = 12 * 1024 * 1024;

/**
 * New post (the + on the Feed): words, up to 4 photos, and whether it is a
 * road alert. It waits for an admin; the driver sees it marked on their Feed.
 */
export default function NewPostScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isDark } = useAppTheme();
  const { getAccessToken } = useAuth();
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [roadAlert, setRoadAlert] = useState(false);
  const [sending, setSending] = useState(false);

  const count = charCount(text.trim());
  const tooLong = count > FEED_TEXT_MAX;
  const ready = (count > 0 || photos.length > 0) && !tooLong && !sending;

  const add = (uris: string[]) => {
    const fits = uris.filter((uri) => {
      try { return (new File(uri).size ?? 0) <= MAX_PHOTO_BYTES; } catch { return true; }
    });
    if (fits.length < uris.length) Alert.alert('A photo is too big', 'Pick a smaller one.');
    setPhotos((now) => [...now, ...fits].slice(0, FEED_PHOTOS_MAX));
  };

  const fromGallery = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.7,
        allowsMultipleSelection: true,
        selectionLimit: FEED_PHOTOS_MAX - photos.length,
      });
      if (!result.canceled) add(result.assets.map((a) => a.uri));
    } catch {
      Alert.alert('Your gallery did not open', 'Try again, or take a photo instead.');
    }
  };

  const fromCamera = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Camera is off', 'Allow the camera for Wheelers in your phone settings, or choose a photo from your gallery.');
      return;
    }
    try {
      const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
      if (!result.canceled && result.assets[0]) add([result.assets[0].uri]);
    } catch {
      Alert.alert('The camera did not open', 'Try again, or choose a photo from your gallery.');
    }
  };

  const addPhoto = () => {
    Alert.alert('Add a photo', undefined, [
      { text: 'Take photo', onPress: () => void fromCamera() },
      { text: 'Choose from gallery', onPress: () => void fromGallery() },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const send = async () => {
    if (!ready) return;
    setSending(true);
    try {
      const base64 = await Promise.all(photos.map((uri) => new File(uri).base64()));
      await createPost(await getAccessTokenWithRetry(getAccessToken), { text: text.trim(), roadAlert, photos: base64 });
      markFeedChanged();
      router.back();
      Alert.alert('Sent', 'Drivers see it once it is approved.');
    } catch (failure) {
      Alert.alert('Not sent', toUserMessage(failure, "Your post didn't send. Try again."));
      setSending(false);
    }
  };

  const cancel = () => {
    if (text.trim() || photos.length) {
      Alert.alert('Discard this post?', undefined, [
        { text: 'Keep writing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => router.back() },
      ]);
    } else router.back();
  };

  const bg = isDark ? theme.colors.black : theme.colors.offWhite;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.screen, { backgroundColor: bg, paddingTop: insets.top + 6 }]}>
      <View style={styles.top}>
        <Pressable accessibilityRole="button" hitSlop={10} onPress={cancel} disabled={sending}>
          <AppText variant="bodyMedium" color={theme.colors.muted}>Cancel</AppText>
        </Pressable>
        <AppText variant="h2">New post</AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !ready }}
          disabled={!ready}
          onPress={() => void send()}
          style={({ pressed }) => [styles.post, !ready && styles.postOff, pressed && { opacity: 0.8 }]}>
          <OnLight>
            {sending ? <ActivityIndicator color={theme.colors.black} size="small" /> : <AppText variant="label">Post</AppText>}
          </OnLight>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        <View style={styles.field}>
          <OnLight>
            <TextInput
              accessibilityLabel="What's happening on the road?"
              autoFocus
              editable={!sending}
              multiline
              onChangeText={setText}
              placeholder="What's happening on the road?"
              placeholderTextColor={theme.colors.mutedLight}
              style={styles.input}
              textAlignVertical="top"
              value={text}
            />
          </OnLight>
        </View>

        <View style={styles.photos}>
          {photos.map((uri) => (
            <View key={uri} style={styles.thumb}>
              <Image source={{ uri }} style={styles.thumbImage} />
              <Pressable
                accessibilityLabel="Remove photo"
                accessibilityRole="button"
                disabled={sending}
                hitSlop={8}
                onPress={() => setPhotos((now) => now.filter((p) => p !== uri))}
                style={styles.remove}>
                <AppText variant="bodySmall" color={theme.colors.white}>✕</AppText>
              </Pressable>
            </View>
          ))}
          {photos.length < FEED_PHOTOS_MAX ? (
            <Pressable accessibilityRole="button" disabled={sending} onPress={addPhoto} style={({ pressed }) => [styles.thumb, styles.addTile, pressed && { opacity: 0.7 }]}>
              <AppText variant="bodySmall" color={theme.colors.muted} style={styles.addText}>+ Photo</AppText>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.row}>
          <OnLight>
            <View style={styles.rowText}>
              <AppText variant="bodyMedium">Road alert</AppText>
              <AppText variant="bodySmall" color={theme.colors.muted}>Shows for 3 hours</AppText>
            </View>
            <Switch
              accessibilityLabel="Road alert"
              disabled={sending}
              onValueChange={setRoadAlert}
              thumbColor={theme.colors.white}
              trackColor={{ false: theme.colors.borderLight, true: theme.colors.green }}
              value={roadAlert}
            />
          </OnLight>
        </View>

        <AppText variant="bodySmall" color={tooLong ? theme.colors.danger : theme.colors.muted} style={styles.count}>
          {count} / {FEED_TEXT_MAX}
        </AppText>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 10 },
  post: { minWidth: 64, height: 36, paddingHorizontal: 16, borderRadius: theme.radii.sm, backgroundColor: theme.colors.orange, alignItems: 'center', justifyContent: 'center' },
  postOff: { opacity: 0.4 },
  body: { paddingHorizontal: 16, gap: 12 },
  field: { minHeight: 150, padding: 14, borderRadius: theme.radii.md, borderWidth: 1, borderColor: theme.colors.borderLight, backgroundColor: theme.colors.white },
  input: { minHeight: 120, fontFamily: 'HankenGrotesk_400Regular', fontSize: 15, lineHeight: 22, color: theme.colors.black, padding: 0 },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumb: { width: 80, height: 80, borderRadius: theme.radii.sm, overflow: 'hidden' },
  thumbImage: { width: '100%', height: '100%' },
  remove: { position: 'absolute', top: 5, right: 5, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(13,13,13,0.7)', alignItems: 'center', justifyContent: 'center' },
  addTile: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.colors.mutedLight, alignItems: 'center', justifyContent: 'center' },
  addText: { fontFamily: 'HankenGrotesk_600SemiBold' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderRadius: theme.radii.md, borderWidth: 1, borderColor: theme.colors.borderLight, backgroundColor: theme.colors.white },
  rowText: { flex: 1 },
  count: { textAlign: 'right', fontVariant: ['tabular-nums'] },
});
