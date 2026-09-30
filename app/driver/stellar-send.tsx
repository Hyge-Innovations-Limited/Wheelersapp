import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { AppText } from '@/components/app-text';
import { BackIcon, CheckIcon, looksLikeAddress, ngnText, shortKey, xlmText } from '@/components/stellar-bits';
import { getAccessTokenWithRetry } from '@/lib/access-token';
import { getStellarMe, requestStellarWithdrawal, type StellarMeResponse } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { invalidateCached, useCachedQuery } from '@/lib/cached-query';
import { useResponsive } from '@/lib/responsive';
import { useAppTheme } from '@/lib/theme-context';
import { theme } from '@/theme';

type Step = 'address' | 'amount' | 'confirm' | 'done';
const STEPS: Step[] = ['address', 'amount', 'confirm'];

/**
 * Send test XLM from the driver's Stellar Testnet account to any testnet
 * address, in the same steps as the naira Withdraw screen: where to, how
 * much, confirm. Operations pays the network fee.
 */
export default function DriverStellarSendScreen() {
  const router = useRouter();
  const { isDark } = useAppTheme();
  const responsive = useResponsive();
  const { getAccessToken } = useAuth();
  const me = useCachedQuery<StellarMeResponse>({
    key: 'stellar.me',
    fetcher: (accessToken) => getStellarMe({ accessToken }),
    staleMs: 20_000,
  });
  const [step, setStep] = useState<Step>('address');
  const [destination, setDestination] = useState('');
  const [amount, setAmount] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const amountRef = useRef<TextInput>(null);

  const data = me.data;
  const account = data?.account ?? null;
  const rate = data?.rate?.ngnPerXlm ?? null;
  const reserve = data?.reserveXlm ?? 1.5;
  const balance = account?.balanceXlm == null ? 0 : Number(account.balanceXlm);
  const spendable = Math.max(0, Math.floor((balance - reserve) * 100) / 100);
  const value = Number(amount.replace(',', '.'));
  const address = destination.trim();
  const surface = isDark ? { backgroundColor: theme.colors.darkSurface, borderColor: theme.colors.darkBorder } : null;
  const inputColor = isDark ? { color: theme.colors.offWhite } : null;

  const addressProblem = !address ? null
    : address === account?.publicKey ? 'That is your own address.'
      : address.length >= 56 && !looksLikeAddress(address) ? 'That is not a Stellar address. It starts with G and is 56 characters long.'
        : null;

  const toAmount = () => {
    setError(null);
    setStep('amount');
    setTimeout(() => amountRef.current?.focus(), 300);
  };

  const review = () => {
    if (!(value > 0)) { setError('Enter an amount of XLM.'); return; }
    if (value > spendable) { setError(`You can send up to ${xlmText(spendable)} XLM. Stellar keeps ${reserve} XLM in every account.`); return; }
    setError(null);
    setStep('confirm');
  };

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      const token = await getAccessTokenWithRetry(getAccessToken);
      if (!token) throw new Error('Not signed in.');
      await requestStellarWithdrawal({ accessToken: token, destination: address, amountXlm: value });
      invalidateCached('stellar');
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Not sent. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const back = () => {
    if (step === 'amount') setStep('address');
    else if (step === 'confirm') setStep('amount');
    else router.back();
    setError(null);
  };

  const stepIndex = STEPS.indexOf(step === 'done' ? 'confirm' : step);
  const title = { address: 'Where to?', amount: 'Enter amount', confirm: 'Confirm send', done: 'Sent' }[step];

  return (
    <AppScreen scroll contentStyle={styles.container} keyboardOffset={theme.spacing.lg}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={back} hitSlop={12} style={[styles.backBtn, surface]} accessibilityLabel="Back">
          <BackIcon />
        </Pressable>
        <AppText variant="h1" numberOfLines={1} style={styles.flex}>Send XLM</AppText>
      </View>

      {/* Step indicator */}
      {step !== 'done' ? (
        <View style={styles.stepRow}>
          {STEPS.map((s, i) => (
            <View key={s} style={[styles.stepItemWrap, i < STEPS.length - 1 && styles.flex]}>
              <View style={[styles.stepDot, s === step && styles.stepDotActive, stepIndex > i && styles.stepDotDone]} />
              {i < STEPS.length - 1 ? <View style={[styles.stepLine, stepIndex > i && styles.stepLineDone]} /> : null}
            </View>
          ))}
        </View>
      ) : null}

      <AppText variant="h2" style={styles.stepTitle}>{title}</AppText>

      {/* ── Step: address ── */}
      {step === 'address' ? (
        <View style={styles.stepContent}>
          <View style={[styles.inputWrap, surface]}>
            <View style={styles.rowBetween}>
              <AppText variant="bodySmall" color={theme.colors.muted} style={styles.inputLabel}>Stellar address</AppText>
              <Pressable hitSlop={10} onPress={async () => setDestination((await Clipboard.getStringAsync()).trim())}>
                <AppText variant="bodySmall" color={theme.colors.orange}>Paste</AppText>
              </Pressable>
            </View>
            <TextInput
              style={[styles.input, styles.addressInput, { fontSize: responsive.font(15), lineHeight: responsive.font(21) }, inputColor]}
              value={destination}
              onChangeText={(t) => setDestination(t.replace(/\s/g, '').toUpperCase())}
              placeholder="G…"
              placeholderTextColor={theme.colors.mutedLight}
              autoCapitalize="characters"
              autoCorrect={false}
              multiline
              autoFocus
            />
          </View>
          {addressProblem ? <AppText variant="bodySmall" color={theme.colors.danger}>{addressProblem}</AppText> : (
            <AppText variant="bodySmall" color={theme.colors.muted}>A Stellar Testnet address. Test XLM only.</AppText>
          )}
          {looksLikeAddress(address) && !addressProblem ? (
            <Pressable onPress={toAmount} style={({ pressed }) => [styles.nextBtn, pressed && styles.btnPressed]}>
              <AppText variant="label" color={theme.colors.white}>Continue</AppText>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {/* ── Step: amount ── */}
      {step === 'amount' ? (
        <View style={styles.stepContent}>
          <View style={styles.chip}>
            <AppText variant="bodySmall" color={theme.colors.muted} style={styles.flexShrink} numberOfLines={1}>To {shortKey(address, 8)}</AppText>
            <Pressable onPress={() => setStep('address')} hitSlop={10}>
              <AppText variant="bodySmall" color={theme.colors.orange}>Change</AppText>
            </Pressable>
          </View>

          <View style={[styles.inputWrap, surface]}>
            <AppText variant="bodySmall" color={theme.colors.muted} style={styles.inputLabel}>Amount (XLM)</AppText>
            <TextInput
              ref={amountRef}
              style={[styles.input, styles.amountInput, { fontSize: responsive.font(28), lineHeight: responsive.font(36) }, inputColor]}
              value={amount}
              onChangeText={(t) => { setAmount(t.replace(/[^0-9.,]/g, '')); setError(null); }}
              placeholder="0.00"
              placeholderTextColor={theme.colors.mutedLight}
              keyboardType="decimal-pad"
            />
          </View>

          <View style={styles.rowBetween}>
            <AppText variant="bodySmall" color={theme.colors.muted}>Available: {xlmText(spendable)} XLM</AppText>
            <Pressable hitSlop={10} onPress={() => { setAmount(String(spendable)); setError(null); }}>
              <AppText variant="bodySmall" color={theme.colors.orange}>Send max</AppText>
            </Pressable>
          </View>

          {rate && value > 0 ? (
            <View style={[styles.feeCard, surface]}>
              <View style={styles.rowBetween}>
                <AppText variant="bodySmall" color={theme.colors.muted}>Network fee</AppText>
                <AppText variant="bodySmall">Paid by Wheelers</AppText>
              </View>
              <View style={[styles.rowBetween, styles.feeTotalRow]}>
                <AppText variant="bodyMedium">Worth today</AppText>
                <AppText variant="bodyMedium">≈ {ngnText(value * rate)}</AppText>
              </View>
            </View>
          ) : null}

          {error ? <AppText variant="bodySmall" color={theme.colors.danger}>{error}</AppText> : null}

          {value > 0 ? (
            <Pressable onPress={review} style={({ pressed }) => [styles.nextBtn, pressed && styles.btnPressed]}>
              <AppText variant="label" color={theme.colors.white}>Review</AppText>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {/* ── Step: confirm ── */}
      {step === 'confirm' ? (
        <View style={styles.stepContent}>
          <View style={[styles.confirmCard, surface]}>
            <Row label="To"><AppText variant="mono" style={styles.confirmValue} numberOfLines={1}>{shortKey(address, 8)}</AppText></Row>
            <View style={styles.confirmDivider} />
            <Row label="Network"><AppText variant="bodyMedium" style={styles.confirmValue}>Stellar Testnet</AppText></Row>
            <View style={styles.confirmDivider} />
            <Row label="Network fee"><AppText variant="bodyMedium" style={styles.confirmValue}>Paid by Wheelers</AppText></Row>
            {rate ? (
              <>
                <View style={styles.confirmDivider} />
                <Row label="Worth today"><AppText variant="bodyMedium" style={styles.confirmValue}>≈ {ngnText(value * rate)}</AppText></Row>
              </>
            ) : null}
            <View style={styles.confirmDivider} />
            <Row label="They receive">
              <AppText variant="h2" color={theme.colors.orange} style={styles.confirmValue} adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={1}>
                {xlmText(value, 7)} XLM
              </AppText>
            </Row>
          </View>

          {error ? <AppText variant="bodySmall" color={theme.colors.danger}>{error}</AppText> : null}

          <Pressable
            onPress={() => void send()}
            disabled={sending}
            style={({ pressed }) => [styles.confirmBtn, pressed && styles.btnPressed, sending && styles.off]}>
            {sending ? <ActivityIndicator color={theme.colors.white} /> : <AppText variant="label" color={theme.colors.white}>Confirm send</AppText>}
          </Pressable>
        </View>
      ) : null}

      {/* ── Sent ── */}
      {step === 'done' ? (
        <View style={styles.stepContent}>
          <View style={[styles.confirmCard, styles.doneCard, surface]}>
            <View style={styles.doneIcon}><CheckIcon size={28} color={theme.colors.green} /></View>
            <AppText variant="h2" style={styles.center}>{xlmText(value, 7)} XLM is on its way</AppText>
            <AppText variant="bodySmall" color={theme.colors.muted} style={styles.center}>
              To {shortKey(address, 8)}. It shows in your activity once the network confirms it, usually within a minute.
            </AppText>
          </View>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.nextBtn, pressed && styles.btnPressed]}>
            <AppText variant="label" color={theme.colors.white}>Done</AppText>
          </Pressable>
        </View>
      ) : null}
    </AppScreen>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.confirmRow}>
      <AppText variant="bodySmall" color={theme.colors.muted} style={styles.confirmLabel}>{label}</AppText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexShrink: { flex: 1, minWidth: 0 },
  center: { textAlign: 'center' },
  container: { paddingTop: theme.spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: theme.radii.xs,
    backgroundColor: theme.colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    ...theme.shadows.subtle,
  },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.md },

  stepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 24, paddingHorizontal: 8 },
  stepItemWrap: { flexDirection: 'row', alignItems: 'center' },
  stepDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.colors.borderLight, borderWidth: 1.5, borderColor: theme.colors.black },
  stepDotActive: { backgroundColor: theme.colors.orange, width: 12, height: 12, borderRadius: 6 },
  stepDotDone: { backgroundColor: theme.colors.orange },
  stepLine: { flex: 1, minWidth: 16, height: 2, backgroundColor: theme.colors.borderLight, marginHorizontal: 4 },
  stepLineDone: { backgroundColor: theme.colors.orange },
  stepTitle: { marginBottom: 20 },
  stepContent: { gap: 16 },

  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.colors.orangeLight,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  inputWrap: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.radii.sm,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    padding: 16,
    gap: 8,
    ...theme.shadows.subtle,
  },
  inputLabel: { textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { fontFamily: 'ClashDisplay_600Semibold', fontSize: 18, color: theme.colors.black, padding: 0 },
  addressInput: { minHeight: 44, textAlignVertical: 'top' },
  amountInput: { fontSize: 28, fontFamily: 'ClashDisplay_700Bold' },

  feeCard: { borderWidth: 1, borderColor: theme.colors.borderLight, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, gap: 6 },
  feeTotalRow: { paddingTop: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.borderLight },

  nextBtn: {
    height: 52,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    ...theme.shadows.card,
  },
  btnPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  off: { opacity: 0.6 },

  confirmCard: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.radii.md,
    padding: 20,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    ...theme.shadows.card,
  },
  confirmRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: theme.spacing.md, paddingVertical: 14 },
  confirmLabel: { flexShrink: 0 },
  confirmValue: { flex: 1, textAlign: 'right' },
  confirmDivider: { height: 1, backgroundColor: theme.colors.borderLight },
  confirmBtn: {
    height: 52,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.black,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    ...theme.shadows.card,
  },
  doneCard: { alignItems: 'center', gap: theme.spacing.sm },
  doneIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.successLight,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
