import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { onStartResult } from '@/lib/trip-code';
import { theme } from '@/theme';

type TripCodeSheetProps = {
  visible: boolean;
  rideId: string;
  riderName?: string | null;
  onClose: () => void;
  /** Sends Start trip with the 4 digits. */
  onSubmit: (code: string) => Promise<void>;
  /** The trip started (right code, or support unlocked it). */
  onStarted: () => void;
};

/**
 * "Ask the rider for their trip code": 4 digits, then Start trip. The server
 * checks them; a wrong code is said here, and after 5 wrong the keypad waits.
 * If the rider cannot give it, support can unlock the trip.
 */
export function TripCodeSheet({ visible, rideId, riderName, onClose, onSubmit, onStarted }: TripCodeSheetProps) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const inputRef = useRef<TextInput>(null);
  // Android does not resize a Modal for the keyboard: the sheet sat BEHIND the
  // keypad and the driver could not see the digits they typed. Lift it by the
  // keyboard's height. (iOS: KeyboardAvoidingView below does it.)
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const shown = Keyboard.addListener('keyboardDidShow', (event) => setKeyboardHeight(event.endCoordinates.height));
    const hidden = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => { shown.remove(); hidden.remove(); };
  }, []);

  useEffect(() => {
    if (!visible) return;
    setCode('');
    setError(null);
    setSending(false);
    const focus = setTimeout(() => inputRef.current?.focus(), 250);
    return () => clearTimeout(focus);
  }, [visible]);

  useEffect(() => onStartResult((result) => {
    if (!visible) return;
    if (result.kind === 'started' && (!result.rideId || result.rideId === rideId)) {
      setSending(false);
      onStarted();
    } else if (result.kind === 'unlocked' && result.rideId === rideId) {
      // Support unlocked it: start without the code.
      setSending(true);
      void onSubmit('').catch(() => setSending(false));
    } else if (result.kind === 'refused') {
      setSending(false);
      setCode('');
      setError(result.message);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }), [visible, rideId, onStarted, onSubmit]);

  const submit = async (value: string) => {
    if (value.length !== 4 || sending) return;
    setSending(true);
    setError(null);
    try {
      await onSubmit(value);
    } catch (submitError) {
      setSending(false);
      setError(submitError instanceof Error ? submitError.message : 'Could not send. Check your connection.');
    }
  };

  const who = riderName?.trim().split(/\s+/)[0] || 'the rider';

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <Pressable style={styles.flex} onPress={onClose} />
        <View style={[styles.sheet, keyboardHeight > 0 && { marginBottom: keyboardHeight }]}>
          <AppText variant="h2">Trip code</AppText>
          <AppText variant="body" color={theme.colors.muted}>
            Ask {who} for their 4-digit trip code. You can start the trip once it is right.
          </AppText>

          <Pressable onPress={() => inputRef.current?.focus()} style={styles.boxes}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={[styles.box, code.length === i && styles.boxActive, error ? styles.boxError : null]}>
                <AppText variant="h1">{code[i] ?? ''}</AppText>
              </View>
            ))}
          </Pressable>
          <TextInput
            ref={inputRef}
            value={code}
            onChangeText={(text) => {
              const digits = text.replace(/\D/g, '').slice(0, 4);
              setCode(digits);
              if (error) setError(null);
              if (digits.length === 4) void submit(digits);
            }}
            keyboardType="number-pad"
            maxLength={4}
            style={styles.hiddenInput}
            caretHidden
            autoComplete="off"
            textContentType="oneTimeCode"
          />

          {error ? <AppText variant="bodySmall" color={theme.colors.danger}>{error}</AppText> : null}

          <Pressable
            disabled={code.length !== 4 || sending}
            onPress={() => void submit(code)}
            style={[styles.startButton, (code.length !== 4 || sending) && styles.startOff]}>
            {sending ? <ActivityIndicator color={theme.colors.white} /> : <AppText variant="label" color={theme.colors.white}>Start trip</AppText>}
          </Pressable>

          <AppText variant="bodySmall" color={theme.colors.muted} style={styles.help}>
            Rider can&apos;t find the code? Call Wheelers support: they can unlock the trip.
          </AppText>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    gap: theme.spacing.md,
    padding: theme.spacing.gutter,
    paddingBottom: theme.spacing.xl,
    backgroundColor: theme.colors.offWhite,
    borderTopLeftRadius: theme.radii.lg,
    borderTopRightRadius: theme.radii.lg,
    borderTopWidth: theme.borders.thick,
    borderColor: theme.colors.black,
  },
  boxes: { flexDirection: 'row', justifyContent: 'center', gap: theme.spacing.md, marginVertical: theme.spacing.sm },
  box: {
    width: 58,
    height: 66,
    borderRadius: theme.radii.sm,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxActive: { borderColor: theme.colors.orange },
  boxError: { borderColor: theme.colors.danger },
  hiddenInput: { position: 'absolute', opacity: 0, width: 1, height: 1 },
  startButton: {
    minHeight: 50,
    borderRadius: theme.radii.sm,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startOff: { opacity: 0.5 },
  help: { textAlign: 'center' },
});
