import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, RefreshControl, StyleSheet, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';

import { AppScreen } from '@/components/app-screen';
import { AppText } from '@/components/app-text';
import { getAccessTokenWithRetry } from '@/lib/access-token';
import { getStellarMe, requestStellarWithdrawal, type StellarMeResponse, type StellarTransferView } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { invalidateCached, useCachedQuery } from '@/lib/cached-query';
import { theme } from '@/theme';

const KIND_LABEL: Record<string, string> = {
  ACCOUNT_OPEN: 'Account opened',
  TOPUP: 'Top-up',
  FARE: 'Trip fare',
  COMMISSION: 'Wheelers commission',
  WITHDRAWAL: 'Withdrawal',
};

function short(key: string): string {
  return `${key.slice(0, 6)}…${key.slice(-6)}`;
}

/**
 * The driver's Stellar TESTNET account (grant demo): its balance, its public
 * address, the transfers on it with explorer links, and sending XLM out to
 * another testnet address. Testnet XLM has no value. Only public addresses
 * are ever shown.
 */
export default function DriverStellarScreen() {
  const router = useRouter();
  const { getAccessToken } = useAuth();
  const me = useCachedQuery<StellarMeResponse>({
    key: 'stellar.me',
    fetcher: (accessToken) => getStellarMe({ accessToken }),
    staleMs: 20_000,
  });
  const [destination, setDestination] = useState('');
  const [amount, setAmount] = useState('');
  const [sending, setSending] = useState(false);
  const data = me.data;
  const account = data?.account ?? null;

  const withdraw = async () => {
    const amountXlm = Number(amount.replace(',', '.'));
    if (!destination.trim() || !(amountXlm > 0)) {
      Alert.alert('Withdraw', 'Enter a testnet address (it starts with G) and an amount of XLM.');
      return;
    }
    setSending(true);
    try {
      const token = await getAccessTokenWithRetry(getAccessToken);
      if (!token) throw new Error('Not signed in.');
      await requestStellarWithdrawal({ accessToken: token, destination: destination.trim(), amountXlm });
      setDestination('');
      setAmount('');
      Alert.alert('Sent to Stellar', 'Your withdrawal is on its way. It shows here once the network confirms it, usually within a minute.');
      invalidateCached('stellar');
    } catch (error) {
      Alert.alert('Withdrawal not sent', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <AppScreen
      scroll
      contentStyle={styles.container}
      refreshControl={<RefreshControl refreshing={me.refreshing} onRefresh={() => void me.refresh()} tintColor={theme.colors.orange} />}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <AppText variant="h3">‹ Back</AppText>
        </Pressable>
        <AppText variant="h1">Stellar Testnet</AppText>
        <AppText variant="bodySmall" color={theme.colors.muted}>
          A test copy of your Wheelers money on the Stellar test network. Test XLM has no value.
        </AppText>
      </View>

      {me.loading ? <ActivityIndicator color={theme.colors.orange} /> : null}
      {data && !data.enabled ? (
        <AppText variant="body" color={theme.colors.muted}>Stellar Testnet is not switched on.</AppText>
      ) : null}

      {data?.enabled && !account ? (
        <View style={styles.card}>
          <AppText variant="body">Your Stellar account opens with your first paid trip.</AppText>
        </View>
      ) : null}

      {account ? (
        <View style={styles.card}>
          <AppText variant="bodySmall" color={theme.colors.muted}>Balance</AppText>
          <AppText variant="h1">{account.balanceXlm === null ? 'Opening…' : `${Number(account.balanceXlm).toLocaleString('en-NG', { maximumFractionDigits: 4 })} XLM`}</AppText>
          {account.balanceNgn !== null ? (
            <AppText variant="bodySmall" color={theme.colors.muted}>
              ≈ ₦{account.balanceNgn.toLocaleString('en-NG')} at ₦{(data?.ngnPerXlm ?? 1000).toLocaleString('en-NG')} = 1 XLM (demo rate)
            </AppText>
          ) : null}
          <Pressable
            onPress={async () => { await Clipboard.setStringAsync(account.publicKey); Alert.alert('Copied', 'Your testnet address is copied.'); }}
            style={styles.row}>
            <AppText variant="bodySmall" color={theme.colors.muted}>Address</AppText>
            <AppText variant="mono">{short(account.publicKey)}  ⧉</AppText>
          </Pressable>
          <Pressable onPress={() => void Linking.openURL(account.explorerUrl)}>
            <AppText variant="label" color={theme.colors.orange}>View on stellar.expert ›</AppText>
          </Pressable>
        </View>
      ) : null}

      {account?.opened ? (
        <View style={styles.card}>
          <AppText variant="h3">Withdraw to a Stellar address</AppText>
          <AppText variant="bodySmall" color={theme.colors.muted}>
            Stellar keeps {data?.reserveXlm ?? 1.5} XLM in every account; you can send the rest.
          </AppText>
          <TextInput
            value={destination}
            onChangeText={setDestination}
            placeholder="G… testnet address"
            autoCapitalize="characters"
            autoCorrect={false}
            style={styles.input}
            placeholderTextColor={theme.colors.mutedLight}
          />
          <TextInput
            value={amount}
            onChangeText={(t) => setAmount(t.replace(/[^0-9.,]/g, ''))}
            placeholder="Amount in XLM"
            keyboardType="decimal-pad"
            style={styles.input}
            placeholderTextColor={theme.colors.mutedLight}
          />
          <Pressable onPress={() => void withdraw()} disabled={sending} style={[styles.button, sending && styles.off]}>
            {sending ? <ActivityIndicator color={theme.colors.white} /> : <AppText variant="label" color={theme.colors.white}>Withdraw</AppText>}
          </Pressable>
        </View>
      ) : null}

      {(data?.transfers ?? []).length ? (
        <View style={styles.card}>
          <AppText variant="h3">Recent</AppText>
          {(data?.transfers ?? []).map((t: StellarTransferView, i: number) => (
            <Pressable
              key={`${t.createdAt}-${i}`}
              disabled={!t.explorerUrl}
              onPress={() => t.explorerUrl && void Linking.openURL(t.explorerUrl)}
              style={styles.transfer}>
              <View style={styles.flex}>
                <AppText variant="bodyMedium">{KIND_LABEL[t.kind] ?? t.kind}{t.memo && t.kind !== 'TOPUP' ? ` · ${t.memo}` : ''}</AppText>
                <AppText variant="monoSmall" color={theme.colors.muted}>
                  {t.status === 'CONFIRMED' ? 'Confirmed ›' : t.status === 'FAILED' ? 'Failed' : 'On its way…'}
                </AppText>
              </View>
              <AppText variant="mono" color={t.direction === 'in' ? theme.colors.green : theme.colors.black}>
                {t.direction === 'in' ? '+' : '−'}{t.amountXlm} XLM
              </AppText>
            </Pressable>
          ))}
        </View>
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: { gap: theme.spacing.md, paddingHorizontal: theme.spacing.gutter, paddingBottom: theme.spacing.xl },
  header: { gap: theme.spacing.xs, paddingTop: theme.spacing.md },
  card: {
    gap: theme.spacing.sm,
    padding: theme.spacing.lg,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.white,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  input: {
    minHeight: 46,
    paddingHorizontal: theme.spacing.md,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    borderRadius: theme.radii.sm,
    fontFamily: theme.fonts.body,
    fontSize: 15,
    color: theme.colors.black,
    backgroundColor: theme.colors.offWhite,
  },
  button: {
    minHeight: 48,
    borderRadius: theme.radii.sm,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  off: { opacity: 0.5 },
  transfer: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, paddingVertical: theme.spacing.xs },
  flex: { flex: 1 },
});
