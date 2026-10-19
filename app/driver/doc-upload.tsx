import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppInput } from '@/components/app-input';
import { AppScreen } from '@/components/app-screen';
import { AppText, OnLight } from '@/components/app-text';
import { FlowHeader } from '@/components/flow-header';
import { getAccessTokenWithRetry } from '@/lib/access-token';
import { getDriverPapers, sendDriverPaper, type DriverPaper } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dayToIso, isPast, isoToDay, isoToWords, maskDay } from '@/lib/day-input';
import { MAX_PAPER_BYTES, papersError } from '@/lib/driver-papers';
import { useResponsive } from '@/lib/responsive';
import { theme } from '@/theme';

/**
 * Send one paper: a photo taken now, one from the gallery, or a PDF. A paper
 * that runs out asks for its expiry date (and is refused if that has passed);
 * one with a number worth keeping offers a box for it. Sending replaces
 * whatever was sent for this paper before.
 */
export default function DriverPaperUploadScreen() {
  const router = useRouter();
  const responsive = useResponsive();
  const { getAccessToken } = useAuth();
  const { type } = useLocalSearchParams<{ type?: string }>();
  const [paper, setPaper] = useState<DriverPaper | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fileUri, setFileUri] = useState<string | null>(null);
  const [fileKind, setFileKind] = useState<'image' | 'pdf'>('image');
  const [expires, setExpires] = useState('');
  const [number, setNumber] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const token = await getAccessTokenWithRetry(getAccessToken);
        if (!token) throw new Error('Please sign in again to send this.');
        const all = await getDriverPapers({ accessToken: token });
        const found = all.needs.flatMap((n) => n.papers).find((p) => p.type === type) ?? null;
        if (!active) return;
        if (!found) { setLoadError('That paper is not one we ask for.'); return; }
        setPaper(found);
        // Renewing: the number usually stays, the date never does.
        setNumber(found.document?.number ?? '');
        if (found.document?.state === 'rejected') setExpires(isoToDay(found.document.expiresOn));
      } catch (e) {
        if (active) setLoadError(papersError(e, 'Could not load this paper. Go back and try again.'));
      }
    })();
    return () => { active = false; };
  }, [type, getAccessToken]);

  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Camera is off', 'Allow the camera for Wheelers in your phone settings, or choose a photo from your gallery.');
      return;
    }
    try {
      const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
      if (!result.canceled && result.assets[0]) choose(result.assets[0].uri, 'image');
    } catch {
      Alert.alert('The camera did not open', 'Try again, or choose a photo from your gallery.');
    }
  }

  async function pickImage() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
      if (!result.canceled && result.assets[0]) choose(result.assets[0].uri, 'image');
    } catch {
      Alert.alert('Your gallery did not open', 'Try again, or take a photo instead.');
    }
  }

  async function pickPdf() {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
      if (!result.canceled && result.assets[0]) choose(result.assets[0].uri, 'pdf');
    } catch {
      Alert.alert('That file did not open', 'Try again, or take a photo of the paper instead.');
    }
  }

  /** A file too big for the server is turned away here, before a slow upload that would only be refused. */
  function choose(uri: string, kind: 'image' | 'pdf') {
    let size = 0;
    try { size = new File(uri).size ?? 0; } catch { size = 0; }
    if (size > MAX_PAPER_BYTES) {
      Alert.alert('That file is too big', kind === 'pdf'
        ? 'Send a PDF under 10 MB, or take a photo of the paper instead.'
        : 'Send a photo under 10 MB. Taking it again with the camera here makes a smaller one.');
      return;
    }
    setFileUri(uri);
    setFileKind(kind);
  }

  const expiresIso = dayToIso(expires);
  const dateError = !paper?.expires || expires.length < 10
    ? undefined
    : !expiresIso ? 'That is not a real date. Use day/month/year, e.g. 31/12/2027.'
      : isPast(expiresIso) ? 'That date has passed. Send the renewed one.' : undefined;
  const ready = Boolean(fileUri) && (!paper?.expires || (expiresIso !== null && !dateError));

  async function send() {
    if (!paper || !fileUri || !ready || sending) return;
    setSending(true);
    try {
      const token = await getAccessTokenWithRetry(getAccessToken);
      if (!token) throw new Error('Please sign in again to send this.');
      await sendDriverPaper({
        accessToken: token,
        type: paper.type,
        file: await new File(fileUri).base64(),
        ...(paper.expires && expiresIso ? { expiresOn: expiresIso } : {}),
        ...(paper.numbered && number.trim() ? { number: number.trim() } : {}),
      });
      router.back();
    } catch (e) {
      // The server's own sentence when it wrote one (expired, wrong kind of file, too big); the standard wording otherwise.
      Alert.alert('Not sent', papersError(e, 'Your paper was not sent. Please try again.'));
    } finally {
      setSending(false);
    }
  }

  const previewHeight = responsive.vh(26, 140, 300);
  const doc = paper?.document ?? null;

  return (
    <AppScreen scroll contentStyle={styles.container} keyboardOffset={theme.spacing.lg}>
      <FlowHeader title={paper?.label ?? 'Paper'} subtitle={paper?.hint} showBack backHref="/driver/docs" />

      {!paper && !loadError ? <ActivityIndicator color={theme.colors.orange} style={styles.loading} /> : null}
      {loadError ? <AppText variant="body" color={theme.colors.danger} style={styles.loading}>{loadError}</AppText> : null}

      {paper ? (
        <>
          {doc?.state === 'rejected' ? (
            <View style={[styles.note, styles.noteBad]}>
              <OnLight>
              <Ionicons name="alert-circle" size={20} color={theme.colors.danger} />
              <AppText variant="bodySmall" style={styles.flex}>
                Sent back{doc.rejectionReason ? `: ${doc.rejectionReason}` : '.'} Send a new one below.
              </AppText>
              </OnLight>
            </View>
          ) : doc?.state === 'expired' ? (
            <View style={[styles.note, styles.noteBad]}>
              <OnLight>
              <Ionicons name="calendar-outline" size={20} color={theme.colors.danger} />
              <AppText variant="bodySmall" style={styles.flex}>The one we have expired {isoToWords(doc.expiresOn)}. Send the renewed one.</AppText>
              </OnLight>
            </View>
          ) : doc ? (
            <View style={styles.note}>
              <OnLight>
              <Ionicons name={doc.state === 'approved' ? 'checkmark-circle' : 'time-outline'} size={20} color={doc.state === 'approved' ? theme.colors.green : theme.colors.orange} />
              <AppText variant="bodySmall" style={styles.flex}>
                {doc.state === 'approved' ? 'We have this one and it is approved.' : 'We have this one and are checking it.'}
                {doc.expiresOn ? ` Valid to ${isoToWords(doc.expiresOn)}.` : ''} Sending another replaces it.
              </AppText>
              </OnLight>
            </View>
          ) : null}

          <View style={styles.uploadArea}>
            {fileUri ? (
              <Pressable onPress={() => setFileUri(null)} style={styles.previewWrap} accessibilityRole="button" accessibilityLabel="Change the file">
                {fileKind === 'image' ? (
                  <Image source={{ uri: fileUri }} style={[styles.preview, { height: previewHeight }]} resizeMode="cover" />
                ) : (
                  <View style={[styles.pdfPreview, { height: previewHeight }]}>
                    <OnLight>
                    <Ionicons name="document-text" size={responsive.scale(48)} color={theme.colors.orange} />
                    <AppText variant="bodyMedium" numberOfLines={1}>PDF chosen</AppText>
                    </OnLight>
                  </View>
                )}
                <View style={styles.changeOverlay}>
                  <AppText variant="label" color={theme.colors.white} numberOfLines={1}>Tap to change</AppText>
                </View>
              </Pressable>
            ) : (
              <View style={[styles.placeholderArea, { paddingVertical: responsive.vh(3, 16, 28) }]}>
                <OnLight>
                <Pressable onPress={() => void takePhoto()} style={[styles.captureButton, { minHeight: responsive.scale(44) }]} hitSlop={8}>
                  <Ionicons name="camera" size={responsive.scale(28)} color={theme.colors.orange} />
                  <AppText variant="label" color={theme.colors.orange} numberOfLines={1}>Take Photo</AppText>
                </Pressable>
                <AppText variant="bodySmall" color={theme.colors.muted}>or</AppText>
                <Pressable onPress={() => void pickImage()} style={[styles.galleryButton, { minHeight: responsive.scale(40) }]} hitSlop={8}>
                  <Ionicons name="images-outline" size={responsive.scale(20)} color={theme.colors.muted} />
                  <AppText variant="bodySmall" color={theme.colors.muted} numberOfLines={1}>Choose from gallery</AppText>
                </Pressable>
                <AppText variant="bodySmall" color={theme.colors.muted}>or</AppText>
                <Pressable onPress={() => void pickPdf()} style={[styles.galleryButton, { minHeight: responsive.scale(40) }]} hitSlop={8}>
                  <Ionicons name="document-text-outline" size={responsive.scale(20)} color={theme.colors.muted} />
                  <AppText variant="bodySmall" color={theme.colors.muted} numberOfLines={1}>Upload PDF</AppText>
                </Pressable>
                </OnLight>
              </View>
            )}
          </View>

          <View style={styles.form}>
            {paper.expires ? (
              <AppInput
                label="Expiry date"
                hint="The date printed on it: day/month/year"
                placeholder="DD/MM/YYYY"
                value={expires}
                onChangeText={(text) => setExpires(maskDay(text))}
                keyboardType="number-pad"
                maxLength={10}
                error={dateError}
              />
            ) : null}
            {paper.numbered ? (
              <AppInput
                label="Number on it (if it has one)"
                placeholder="e.g. the policy or permit number"
                value={number}
                onChangeText={setNumber}
                autoCapitalize="characters"
                maxLength={60}
              />
            ) : null}
          </View>

          <View style={styles.spacer} />
          <AppButton title={doc ? 'Send the new one' : 'Send'} onPress={() => void send()} disabled={!ready} loading={sending} />
        </>
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: { paddingTop: theme.spacing.xxxl, gap: theme.spacing.lg },
  loading: { marginTop: theme.spacing.xxl, textAlign: 'center' },
  flex: { flex: 1, minWidth: 0 },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.white,
  },
  noteBad: { borderColor: theme.colors.danger, backgroundColor: theme.colors.dangerLight },
  uploadArea: { width: '100%' },
  placeholderArea: {
    borderWidth: theme.borders.thick,
    borderStyle: 'dashed',
    borderColor: theme.colors.orange,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.orangeLight,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.md,
  },
  captureButton: { alignItems: 'center', justifyContent: 'center', gap: theme.spacing.sm },
  galleryButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing.xs },
  previewWrap: {
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.borderLight,
    overflow: 'hidden',
    ...theme.shadows.card,
  },
  preview: { width: '100%' },
  pdfPreview: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.orangeLight,
    gap: theme.spacing.sm,
  },
  changeOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
  },
  form: { width: '100%', gap: theme.spacing.md },
  spacer: { flexGrow: 1, minHeight: theme.spacing.lg },
});
