import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import {
  ApiError,
  completeWalletPinReset,
  getWalletSecurity,
  setWalletPin,
  startWalletPinReset,
} from '@/lib/api';
import { theme } from '@/theme';

const PIN_LENGTH = 4;

type Mode =
  | 'loading'
  | 'enter'          // has a PIN → type it
  | 'create'         // first PIN, or the new PIN after a reset
  | 'reset-warn'     // no email on file → a reset pauses withdrawals for 24h
  | 'reset-code'     // a code was emailed
  | 'working'        // the caller is submitting with the PIN we returned
  | 'notice';        // frozen, locked, or "PIN changed — paused"

type Notice = { title: string; body: string };

function until(iso: string): string {
  const minutes = Math.max(1, Math.ceil((new Date(iso).getTime() - Date.now()) / 60_000));
  if (minutes < 90) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  return `${Math.ceil(minutes / 60)} hours`;
}

/**
 * The wallet PIN, for any screen that moves money out.
 *
 *   const pinGate = useWalletPin(getAccessToken);
 *   const pin = await pinGate.ask();          // null → the user backed out
 *   try { await withdraw({ pin }) }
 *   catch (e) { if (pinGate.isPinError(e)) pin = await pinGate.ask(e.message) … }
 *   pinGate.done();
 *   … render {pinGate.sheet}
 *
 * It creates the PIN the first time, handles "Forgot PIN", and explains a
 * lockout or a freeze — the server owns every rule; this only asks and shows.
 * The PIN is held in memory for the length of one attempt and nowhere else.
 */
export function useWalletPin(getAccessToken: () => Promise<string | null | undefined>) {
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<Mode>('loading');
  const [digits, setDigits] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [busy, setBusy] = useState(false);

  const resolver = useRef<((pin: string | null) => void) | null>(null);
  const firstEntry = useRef<string | null>(null);
  const purpose = useRef<'create' | 'reset'>('create');

  const token = useCallback(async () => {
    const accessToken = await getAccessToken();
    if (!accessToken) throw new Error('Please sign in again.');
    return accessToken;
  }, [getAccessToken]);

  const finish = useCallback((pin: string | null) => {
    const resolve = resolver.current;
    resolver.current = null;
    if (pin === null) setVisible(false);
    else setMode('working');
    resolve?.(pin);
  }, []);

  const showNotice = useCallback((next: Notice) => {
    setNotice(next);
    setMode('notice');
  }, []);

  const startCreate = useCallback((why: 'create' | 'reset') => {
    purpose.current = why;
    firstEntry.current = null;
    setDigits('');
    setError('');
    setMode('create');
  }, []);

  /** Open the sheet and wait for a PIN. Pass the server's message to re-ask after a wrong one. */
  const ask = useCallback(async (retryMessage?: string): Promise<string | null> => {
    setVisible(true);
    setDigits('');
    setCode('');
    setError(retryMessage ?? '');
    const promise = new Promise<string | null>((resolve) => { resolver.current = resolve; });

    if (retryMessage) {
      setMode('enter');
      return promise;
    }

    setMode('loading');
    try {
      const security = await getWalletSecurity({ accessToken: await token() });
      if (security.frozenUntil) {
        showNotice(security.frozenReason === 'pin_reset'
          ? { title: 'Withdrawals are paused', body: `For your safety, withdrawals are paused for ${until(security.frozenUntil)} after your PIN reset. Deposits and rides work as normal.` }
          : { title: 'Withdrawals are paused', body: 'Withdrawals are paused on your account. Contact Wheelers support to lift it.' });
      } else if (security.pinLockedUntil) {
        showNotice({ title: 'Too many wrong PINs', body: `Try again in ${until(security.pinLockedUntil)}.` });
      } else if (security.hasPin) {
        setMode('enter');
      } else {
        startCreate('create');
      }
    } catch (e) {
      showNotice({ title: 'Something went wrong', body: e instanceof Error ? e.message : 'Please try again.' });
    }
    return promise;
  }, [showNotice, startCreate, token]);

  const done = useCallback(() => {
    resolver.current?.(null);
    resolver.current = null;
    setVisible(false);
  }, []);

  const isPinError = useCallback(
    (e: unknown) => e instanceof ApiError && (e.code === 'PIN_WRONG' || e.code === 'PIN_REQUIRED'),
    [],
  );

  /* ── the four digits are in ─────────────────────────────────────────── */

  const onComplete = useCallback(async (pin: string) => {
    if (mode === 'enter') {
      finish(pin);
      return;
    }
    // choosing a PIN: once, then again to confirm
    if (firstEntry.current === null) {
      firstEntry.current = pin;
      setDigits('');
      return;
    }
    if (firstEntry.current !== pin) {
      firstEntry.current = null;
      setDigits('');
      setError('Those didn’t match. Start again.');
      return;
    }

    setBusy(true);
    try {
      const accessToken = await token();
      if (purpose.current === 'create') {
        await setWalletPin({ accessToken, pin });
        finish(pin);
      } else {
        const result = await completeWalletPinReset({ accessToken, newPin: pin, code: code || undefined });
        if (result.frozenUntil) {
          showNotice({ title: 'PIN changed', body: `Withdrawals are paused for ${until(result.frozenUntil)} to keep your money safe. Deposits and rides work as normal.` });
        } else {
          finish(pin);
        }
      }
    } catch (e) {
      firstEntry.current = null;
      setDigits('');
      setError(e instanceof Error ? e.message : 'Please try again.');
      if (e instanceof ApiError && e.code?.startsWith('CODE_')) setMode('reset-code');
    } finally {
      setBusy(false);
    }
  }, [code, finish, mode, showNotice, token]);

  // No side effects inside a state updater (React may run one twice): the
  // next value is worked out here, from the value this render was given.
  const press = useCallback((key: string) => {
    if (busy) return;
    setError('');
    if (key === 'del') {
      setDigits(digits.slice(0, -1));
      return;
    }
    if (digits.length >= PIN_LENGTH) return;
    const next = digits + key;
    setDigits(next);
    // A beat, so the fourth dot is seen filling before the sheet moves on.
    if (next.length === PIN_LENGTH) setTimeout(() => { void onComplete(next); }, 110);
  }, [busy, digits, onComplete]);

  const forgot = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const start = await startWalletPinReset({ accessToken: await token() });
      if (start.method === 'email') {
        setSentTo(start.sentTo);
        setCode('');
        setMode('reset-code');
      } else {
        setMode('reset-warn');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }, [token]);

  /* ── render ─────────────────────────────────────────────────────────── */

  const heading = useMemo(() => {
    if (mode === 'enter') return { title: 'Enter your wallet PIN', body: 'To send this withdrawal.' };
    if (mode === 'create') {
      if (firstEntry.current !== null) return { title: 'Enter it once more', body: 'Just to be sure you typed it right.' };
      return purpose.current === 'reset'
        ? { title: 'Choose a new PIN', body: 'Four digits you’ll remember and nobody else will guess.' }
        : { title: 'Create your wallet PIN', body: 'Four digits. You’ll enter it every time you withdraw, so nobody else can move your money.' };
    }
    if (mode === 'reset-code') return { title: 'Check your email', body: `We sent a 6-digit code to ${sentTo}.` };
    if (mode === 'reset-warn') return { title: 'Reset your PIN', body: '' };
    if (mode === 'working') return { title: 'Sending your money…', body: 'Don’t close the app.' };
    return { title: notice?.title ?? '', body: notice?.body ?? '' };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, notice, sentTo, digits]);

  const showPad = mode === 'enter' || mode === 'create';

  const sheet = (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={mode === 'working' ? undefined : done} statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, theme.spacing.lg) + theme.spacing.sm }]}>
          <View style={styles.headerRow}>
            <AppText variant="label" color={theme.colors.orange}>WALLET PIN</AppText>
            {mode !== 'working' && (
              <Pressable onPress={done} hitSlop={14} accessibilityRole="button" accessibilityLabel="Close">
                <AppText variant="bodyMedium" color={theme.colors.muted}>Cancel</AppText>
              </Pressable>
            )}
          </View>

          {mode === 'loading' ? (
            <View style={styles.center}><ActivityIndicator color={theme.colors.black} /></View>
          ) : (
            <>
              <AppText variant="h2" style={styles.title}>{heading.title}</AppText>
              {heading.body ? <AppText variant="body" color={theme.colors.muted} style={styles.body}>{heading.body}</AppText> : null}
            </>
          )}

          {mode === 'working' && <View style={styles.center}><ActivityIndicator color={theme.colors.black} /></View>}

          {mode === 'reset-warn' && (
            <>
              <View style={styles.warn}>
                <AppText variant="bodyMedium">Withdrawals pause for 24 hours</AppText>
                <AppText variant="bodySmall" color={theme.colors.muted} style={styles.warnBody}>
                  There’s no email on your account, so to keep your money safe we pause withdrawals for a day after a reset. Deposits and rides keep working, and we’ll tell you on WhatsApp.
                </AppText>
              </View>
              <Pressable style={({ pressed }) => [styles.primary, pressed && styles.pressed]} onPress={() => { setCode(''); startCreate('reset'); }}>
                <AppText variant="bodyMedium" color={theme.colors.white}>I understand — reset my PIN</AppText>
              </Pressable>
            </>
          )}

          {mode === 'reset-code' && (
            <>
              <TextInput
                value={code}
                onChangeText={(t) => { setError(''); setCode(t.replace(/\D/g, '').slice(0, 6)); }}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                placeholder="000000"
                placeholderTextColor={theme.colors.mutedLight}
                maxLength={6}
                autoFocus
                style={styles.codeInput}
              />
              {error ? <AppText variant="bodySmall" color={theme.colors.danger} style={styles.error}>{error}</AppText> : null}
              <Pressable
                disabled={code.length !== 6}
                style={({ pressed }) => [styles.primary, pressed && styles.pressed, code.length !== 6 && styles.disabled]}
                onPress={() => startCreate('reset')}
              >
                <AppText variant="bodyMedium" color={theme.colors.white}>Continue</AppText>
              </Pressable>
            </>
          )}

          {mode === 'notice' && (
            <Pressable style={({ pressed }) => [styles.primary, pressed && styles.pressed]} onPress={done}>
              <AppText variant="bodyMedium" color={theme.colors.white}>OK</AppText>
            </Pressable>
          )}

          {showPad && (
            <>
              <View style={styles.dots}>
                {Array.from({ length: PIN_LENGTH }, (_, i) => (
                  <View key={i} style={[styles.dot, i < digits.length && styles.dotOn]} />
                ))}
              </View>
              <AppText variant="bodySmall" color={theme.colors.danger} style={styles.error}>{error || ' '}</AppText>

              <View style={styles.pad}>
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((key) =>
                  key === '' ? (
                    <View key="spacer" style={styles.keySpacer} />
                  ) : (
                    <Pressable
                      key={key}
                      onPress={() => press(key)}
                      disabled={busy}
                      accessibilityRole="button"
                      accessibilityLabel={key === 'del' ? 'Delete' : key}
                      style={({ pressed }) => [styles.key, key === 'del' && styles.keyPlain, pressed && (key === 'del' ? styles.keyPlainPressed : styles.keyPressed)]}
                    >
                      <AppText variant={key === 'del' ? 'bodyMedium' : 'h2'} color={key === 'del' ? theme.colors.muted : theme.colors.black}>
                        {key === 'del' ? 'Delete' : key}
                      </AppText>
                    </Pressable>
                  ),
                )}
              </View>

              {mode === 'enter' && (
                <Pressable onPress={forgot} disabled={busy} hitSlop={10} style={styles.forgot}>
                  <AppText variant="bodyMedium" color={theme.colors.muted} style={styles.underline}>Forgot PIN?</AppText>
                </Pressable>
              )}
              {busy && <ActivityIndicator color={theme.colors.black} style={styles.busy} />}
            </>
          )}
        </View>
      </View>
    </Modal>
  );

  return { ask, done, isPinError, sheet };
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
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.md },
  title: { marginBottom: theme.spacing.xs },
  body: { marginBottom: theme.spacing.sm },
  center: { paddingVertical: theme.spacing.xxxl, alignItems: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 14, marginTop: theme.spacing.lg },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: theme.borders.thick, borderColor: theme.colors.black, backgroundColor: theme.colors.white },
  dotOn: { backgroundColor: theme.colors.orange },
  error: { textAlign: 'center', marginTop: theme.spacing.sm, minHeight: 18 },
  pad: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12, marginTop: theme.spacing.sm, alignSelf: 'center', width: '100%', maxWidth: 320 },
  key: {
    width: '30%',
    height: 58,
    borderRadius: theme.radii.md,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadows.subtle,
  },
  keyPressed: { backgroundColor: theme.colors.orangeLight, transform: [{ translateX: 2 }, { translateY: 2 }], shadowOffset: { width: 0, height: 0 }, elevation: 0 },
  keyPlain: { backgroundColor: 'transparent', borderColor: 'transparent', shadowOpacity: 0, elevation: 0 },
  keyPlainPressed: { opacity: 0.5 },
  keySpacer: { width: '30%', height: 58 },
  forgot: { alignSelf: 'center', marginTop: theme.spacing.lg, padding: theme.spacing.xs },
  underline: { textDecorationLine: 'underline' },
  busy: { marginTop: theme.spacing.md },
  warn: { backgroundColor: '#FFEFC2', borderWidth: theme.borders.thick, borderColor: theme.colors.black, borderRadius: theme.radii.md, padding: theme.spacing.lg, marginTop: theme.spacing.md },
  warnBody: { marginTop: theme.spacing.xs },
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
  disabled: { opacity: 0.4 },
  codeInput: {
    marginTop: theme.spacing.lg,
    height: 60,
    borderRadius: theme.radii.md,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.white,
    textAlign: 'center',
    fontSize: 28,
    letterSpacing: 10,
    color: theme.colors.black,
  },
});
