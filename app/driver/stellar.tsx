import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { Linking, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppCard } from '@/components/app-card';
import { AppInput } from '@/components/app-input';
import { AppScreen } from '@/components/app-screen';
import { AppText } from '@/components/app-text';
import { SkeletonCard } from '@/components/SkeletonLoader';
import { StatusPill } from '@/components/StatusPill';
import { getAccessTokenWithRetry } from '@/lib/access-token';
import { getStellarMe, requestStellarWithdrawal, type StellarMeResponse, type StellarTransferView } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { invalidateCached, useCachedQuery } from '@/lib/cached-query';
import { theme } from '@/theme';

type IconName = ComponentProps<typeof MaterialIcons>['name'];

const heroMuted = '#9C948D';

function xlmText(amount: number | string, digits = 2): string {
  return Number(amount).toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

function naira(amount: number): string {
  return `₦${Math.round(amount).toLocaleString('en-NG')}`;
}

function shortAddress(key: string): string {
  return `${key.slice(0, 8)}…${key.slice(-8)}`;
}

function when(iso: string): string {
  return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** What a transfer is, from this driver's side. */
function describe(t: StellarTransferView): { title: string; icon: IconName } {
  switch (t.kind) {
    case 'ACCOUNT_OPEN': return { title: 'Account opened', icon: 'account-balance-wallet' };
    case 'FARE': return { title: t.direction === 'in' ? 'Trip fare received' : 'Trip fare paid', icon: 'directions-car' };
    case 'COMMISSION': return { title: 'Wheelers commission', icon: 'percent' };
    case 'WITHDRAWAL': return { title: t.direction === 'in' ? 'Received' : 'Sent out', icon: t.direction === 'in' ? 'south-west' : 'north-east' };
    default: return { title: t.kind === 'TOPUP' ? 'Top-up' : t.kind, icon: 'south-west' };
  }
}

/** A tap copies; the button itself says so for a moment. No pop-up. */
function useCopied(): [boolean, (text: string) => Promise<void>] {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const copy = async (text: string) => {
    await Clipboard.setStringAsync(text);
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1800);
  };
  return [copied, copy];
}

/**
 * The driver's Stellar TESTNET account (grant demo): its balance in test XLM
 * with a naira equivalent, the public address to copy, sending XLM out, and
 * the activity on it with explorer links. Only public addresses are shown.
 */
export default function DriverStellarScreen() {
  const router = useRouter();
  const { getAccessToken } = useAuth();
  const me = useCachedQuery<StellarMeResponse>({
    key: 'stellar.me',
    fetcher: (accessToken) => getStellarMe({ accessToken }),
    staleMs: 20_000,
  });
  const [copied, copy] = useCopied();
  const [destination, setDestination] = useState('');
  const [amount, setAmount] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const data = me.data;
  const account = data?.account ?? null;
  const transfers = data?.transfers ?? [];
  const reserve = data?.reserveXlm ?? 1.5;
  const balance = account?.balanceXlm === null || account?.balanceXlm === undefined ? null : Number(account.balanceXlm);
  const spendable = balance === null ? 0 : Math.max(0, Math.floor((balance - reserve) * 100) / 100);

  const send = async () => {
    const amountXlm = Number(amount.replace(',', '.'));
    if (!destination.trim() || !(amountXlm > 0)) {
      setResult({ ok: false, text: 'Enter a testnet address (it starts with G) and an amount of XLM.' });
      return;
    }
    setSending(true);
    setResult(null);
    try {
      const token = await getAccessTokenWithRetry(getAccessToken);
      if (!token) throw new Error('Not signed in.');
      await requestStellarWithdrawal({ accessToken: token, destination: destination.trim(), amountXlm });
      setDestination('');
      setAmount('');
      setResult({ ok: true, text: `${xlmText(amountXlm, 7)} XLM is on its way. It shows below once the network confirms it, usually within a minute.` });
      invalidateCached('stellar');
    } catch (error) {
      setResult({ ok: false, text: error instanceof Error ? error.message : 'Not sent. Please try again.' });
    } finally {
      setSending(false);
    }
  };

  return (
    <AppScreen
      backgroundColor={theme.colors.offWhite}
      scroll
      contentStyle={styles.container}
      refreshControl={<RefreshControl refreshing={me.refreshing} onRefresh={() => void me.refresh()} tintColor={theme.colors.orange} />}>
      <StatusBar style="dark" backgroundColor={theme.colors.offWhite} />

      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Back">
          <MaterialIcons name="arrow-back" size={20} color={theme.colors.black} />
        </Pressable>
        <StatusPill label="TESTNET" variant="green" dotColor={theme.colors.green} />
      </View>

      <View style={styles.heading}>
        <AppText variant="h1">Stellar</AppText>
        <AppText variant="bodySmall" color={theme.colors.muted}>
          Your trips are also paid here, in test XLM. It has no real value and is separate from your Wheelers wallet.
        </AppText>
      </View>

      {me.loading && !data ? <SkeletonCard lines={3} /> : null}

      {data && !data.enabled ? (
        <AppCard>
          <AppText variant="bodyMedium">Stellar Testnet is not switched on right now.</AppText>
        </AppCard>
      ) : null}

      {data?.enabled ? (
        <AppCard backgroundColor={theme.colors.black} style={styles.hero}>
          <View style={styles.rowBetween}>
            <AppText variant="monoSmall" color={heroMuted}>BALANCE</AppText>
            {account?.opened ? null : <AppText variant="monoSmall" color={theme.colors.orange}>OPENING…</AppText>}
          </View>
          <View style={styles.amountRow}>
            <AppText variant="display" color={theme.colors.offWhite} adjustsFontSizeToFit minimumFontScale={0.6} numberOfLines={1} style={styles.shrink}>
              {balance === null ? '—' : xlmText(balance)}
            </AppText>
            <AppText variant="h2" color={theme.colors.orange}>XLM</AppText>
          </View>
          {account?.balanceNgnEquivalent != null && data.rate ? (
            <AppText variant="bodySmall" color={heroMuted}>
              ≈ {naira(account.balanceNgnEquivalent)}  ·  ₦{data.rate.ngnPerXlm.toLocaleString('en-NG', { maximumFractionDigits: 2 })} per XLM today
            </AppText>
          ) : (
            <AppText variant="bodySmall" color={heroMuted}>
              {account?.opened ? 'No naira price right now.' : 'Your account is being opened with 100 test XLM. Pull down to refresh.'}
            </AppText>
          )}

          {account ? (
            <>
              <View style={styles.heroDivider} />
              <AppText variant="monoSmall" color={heroMuted}>YOUR ADDRESS</AppText>
              <View style={styles.addressRow}>
                <Pressable onPress={() => void copy(account.publicKey)} style={styles.shrink} accessibilityLabel="Copy your address">
                  <AppText variant="mono" color={theme.colors.offWhite} numberOfLines={1}>{shortAddress(account.publicKey)}</AppText>
                </Pressable>
                <Pressable
                  onPress={() => void copy(account.publicKey)}
                  style={[styles.copyButton, copied && styles.copyButtonDone]}
                  accessibilityRole="button"
                  accessibilityLabel={copied ? 'Copied' : 'Copy address'}>
                  <MaterialIcons name={copied ? 'check' : 'content-copy'} size={14} color={copied ? theme.colors.white : theme.colors.black} />
                  <AppText variant="label" color={copied ? theme.colors.white : theme.colors.black}>{copied ? 'Copied' : 'Copy'}</AppText>
                </Pressable>
              </View>
              <Pressable onPress={() => void Linking.openURL(account.explorerUrl)} style={styles.link} hitSlop={6}>
                <AppText variant="label" color={theme.colors.orange}>View on stellar.expert</AppText>
                <MaterialIcons name="open-in-new" size={14} color={theme.colors.orange} />
              </Pressable>
            </>
          ) : null}
        </AppCard>
      ) : null}

      {account?.opened ? (
        <AppCard style={styles.section}>
          <View style={styles.rowBetween}>
            <AppText variant="h3">Send test XLM</AppText>
            <AppText variant="monoSmall" color={theme.colors.muted}>UP TO {xlmText(spendable)} XLM</AppText>
          </View>

          <View style={styles.field}>
            <View style={styles.rowBetween}>
              <AppText variant="label">To address</AppText>
              <Pressable
                hitSlop={8}
                style={styles.inlineAction}
                onPress={async () => setDestination((await Clipboard.getStringAsync()).trim())}>
                <MaterialIcons name="content-paste" size={13} color={theme.colors.orange} />
                <AppText variant="label" color={theme.colors.orange}>Paste</AppText>
              </Pressable>
            </View>
            <AppInput
              value={destination}
              onChangeText={(text) => { setDestination(text); setResult(null); }}
              placeholder="G… testnet address"
              autoCapitalize="characters"
              autoCorrect={false}
            />
          </View>

          <View style={styles.field}>
            <View style={styles.rowBetween}>
              <AppText variant="label">Amount</AppText>
              <Pressable hitSlop={8} onPress={() => { setAmount(String(spendable)); setResult(null); }}>
                <AppText variant="label" color={theme.colors.orange}>Max</AppText>
              </Pressable>
            </View>
            <AppInput
              value={amount}
              onChangeText={(text) => { setAmount(text.replace(/[^0-9.,]/g, '')); setResult(null); }}
              placeholder="0.00 XLM"
              keyboardType="decimal-pad"
            />
            {data?.rate && Number(amount.replace(',', '.')) > 0 ? (
              <AppText variant="bodySmall" color={theme.colors.muted}>
                ≈ {naira(Number(amount.replace(',', '.')) * data.rate.ngnPerXlm)} at today&apos;s price
              </AppText>
            ) : null}
          </View>

          {result ? (
            <View style={[styles.notice, result.ok ? styles.noticeOk : styles.noticeBad]}>
              <MaterialIcons name={result.ok ? 'check' : 'block'} size={16} color={result.ok ? theme.colors.green : theme.colors.danger} />
              <AppText variant="bodySmall" color={result.ok ? theme.colors.black : theme.colors.danger} style={styles.shrink}>{result.text}</AppText>
            </View>
          ) : null}

          <AppButton title="Send" onPress={() => void send()} loading={sending} disabled={spendable <= 0} />
          <AppText variant="bodySmall" color={theme.colors.muted}>
            Stellar keeps {reserve} XLM in every account, so that part can&apos;t be sent.
          </AppText>
        </AppCard>
      ) : null}

      {data?.enabled ? (
        <AppCard style={styles.section}>
          <AppText variant="h3">Activity</AppText>
          {transfers.length === 0 ? (
            <AppText variant="bodySmall" color={theme.colors.muted}>Nothing yet. Your trip payments show here.</AppText>
          ) : null}
          {transfers.map((t, index) => {
            const { title, icon } = describe(t);
            const incoming = t.direction === 'in';
            const done = t.status === 'CONFIRMED';
            const status = done ? null
              : t.status === 'SKIPPED' ? `Skipped${t.note ? `: ${t.note}` : ''}`
                : t.status === 'FAILED' ? 'Failed'
                  : 'On its way…';
            return (
              <Pressable
                key={`${t.createdAt}-${index}`}
                disabled={!t.explorerUrl}
                onPress={() => t.explorerUrl && void Linking.openURL(t.explorerUrl)}
                style={[styles.activityRow, index < transfers.length - 1 && styles.divider]}>
                <View style={[styles.activityIcon, incoming ? styles.iconIn : styles.iconOut]}>
                  <MaterialIcons name={icon} size={18} color={incoming ? theme.colors.green : theme.colors.black} />
                </View>
                <View style={styles.activityCopy}>
                  <AppText variant="bodyMedium" numberOfLines={1}>{title}</AppText>
                  <AppText variant="bodySmall" color={theme.colors.muted} numberOfLines={1}>
                    {[t.kind === 'FARE' || t.kind === 'COMMISSION' ? t.memo : null, when(t.createdAt)].filter(Boolean).join('  ·  ')}
                  </AppText>
                  {status ? (
                    <AppText variant="bodySmall" color={t.status === 'SKIPPED' || t.status === 'FAILED' ? theme.colors.danger : theme.colors.warning} numberOfLines={2}>
                      {status}
                    </AppText>
                  ) : null}
                </View>
                <View style={styles.activityAmount}>
                  <AppText
                    variant="mono"
                    numberOfLines={1}
                    color={!done ? theme.colors.mutedLight : incoming ? theme.colors.green : theme.colors.black}
                    style={t.status === 'SKIPPED' || t.status === 'FAILED' ? styles.struck : null}>
                    {incoming ? '+' : '−'}{xlmText(t.amountXlm, 4)}
                  </AppText>
                  {t.amountNgn ? <AppText variant="bodySmall" color={theme.colors.muted}>≈ {naira(t.amountNgn)}</AppText> : null}
                </View>
                {t.explorerUrl ? <MaterialIcons name="open-in-new" size={14} color={theme.colors.mutedLight} /> : null}
              </Pressable>
            );
          })}
        </AppCard>
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: { gap: theme.spacing.lg, paddingTop: theme.spacing.md, paddingBottom: theme.spacing.xxl },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading: { gap: theme.spacing.xs },
  hero: { gap: theme.spacing.xs },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', gap: theme.spacing.sm },
  shrink: { flexShrink: 1 },
  heroDivider: { height: 1, backgroundColor: theme.colors.darkBorder, marginVertical: theme.spacing.sm },
  addressRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.md },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 8,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.offWhite,
  },
  copyButtonDone: { backgroundColor: theme.colors.green },
  link: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: theme.spacing.xs, alignSelf: 'flex-start' },
  section: { gap: theme.spacing.md },
  field: { gap: theme.spacing.xs },
  inlineAction: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radii.sm,
    borderWidth: theme.borders.regular,
  },
  noticeOk: { backgroundColor: theme.colors.successLight, borderColor: theme.colors.green },
  noticeBad: { backgroundColor: theme.colors.dangerLight, borderColor: theme.colors.danger },
  activityRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, paddingVertical: theme.spacing.xs },
  divider: { borderBottomWidth: 1, borderBottomColor: '#EEE0D4', paddingBottom: theme.spacing.md },
  activityIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  iconIn: { backgroundColor: theme.colors.successLight },
  iconOut: { backgroundColor: '#F5F2ED' },
  activityCopy: { flex: 1, minWidth: 0, gap: 2 },
  // The amount is never truncated to fit the label beside it.
  activityAmount: { flexShrink: 0, alignItems: 'flex-end', gap: 2 },
  struck: { textDecorationLine: 'line-through' },
});
