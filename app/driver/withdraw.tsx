import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Path, Polyline } from 'react-native-svg';

import { AppScreen } from '@/components/app-screen';
import { AppText } from '@/components/app-text';
import { useKeyboardHeight } from '@/hooks/use-keyboard';
import { useResponsive } from '@/lib/responsive';
import { getAccessTokenWithRetry } from '@/lib/access-token';
import {
  createWalletWithdrawal,
  FAILED_WITHDRAWAL_STATUSES,
  getWithdrawalBankNetworks,
  verifyWithdrawalBankAccount,
  waitForWithdrawalOutcome,
  type WithdrawalBankNetwork,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAppTheme } from '@/lib/theme-context';
import { invalidateWalletCache, useWalletOverview } from '@/lib/wallet-overview';
import { theme } from '@/theme';

function formatNgn(amount: number): string {
  return `NGN ${Math.round(amount).toLocaleString('en-NG')}`;
}

// There is deliberately NO minimum-withdrawal constant here. The app used to
// mirror the backend's floor, and the copy went stale the day the provider
// changed — drivers were refused withdrawals the server would have paid. The
// server owns that rule and its message is shown as-is.


// ── Icons ─────────────────────────────────────────────
function BackIcon({ size = 22 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={theme.colors.black} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Line x1="19" y1="12" x2="5" y2="12" />
      <Polyline points="12 19 5 12 12 5" />
    </Svg>
  );
}

function BankIcon({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={theme.colors.muted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 22V8l9-6 9 6v14" />
      <Path d="M7 22V12h4v10" />
      <Path d="M13 22V12h4v10" />
      <Line x1="2" y1="22" x2="22" y2="22" />
    </Svg>
  );
}

function ChevronDownIcon({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={theme.colors.muted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="6 9 12 15 18 9" />
    </Svg>
  );
}

function CheckIcon({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={theme.colors.orange} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="20 6 9 17 4 12" />
    </Svg>
  );
}

function SearchIcon({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={theme.colors.muted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="11" cy="11" r="8" />
      <Line x1="21" y1="21" x2="16.65" y2="16.65" />
    </Svg>
  );
}

function getBankId(bank: WithdrawalBankNetwork): string {
  return bank.id || bank.uuid || '';
}

// ── Steps ─────────────────────────────────────────────
type Step = 'bank' | 'account' | 'amount' | 'confirm';

export default function DriverWithdrawScreen() {
  const router = useRouter();
  const { isDark } = useAppTheme();
  const { getAccessToken } = useAuth();
  const { overview } = useWalletOverview();
  const insets = useSafeAreaInsets();
  const responsive = useResponsive();
  const keyboardHeight = useKeyboardHeight();
  const balanceNgn = overview?.balanceNgn ?? 0;

  const [step, setStep] = useState<Step>('bank');
  const [banks, setBanks] = useState<WithdrawalBankNetwork[]>([]);
  const [banksLoading, setBanksLoading] = useState(true);
  const [selectedBank, setSelectedBank] = useState<WithdrawalBankNetwork | null>(null);
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [bankSearchQuery, setBankSearchQuery] = useState('');
  const [showBankModal, setShowBankModal] = useState(false);

  const accountRef = useRef<TextInput>(null);
  const amountRef = useRef<TextInput>(null);

  // Fetch banks on mount
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const accessToken = await getAccessTokenWithRetry(getAccessToken);
      if (!accessToken || cancelled) return;
      try {
        const res = await getWithdrawalBankNetworks({ accessToken });
        if (!cancelled) setBanks(res.items);
      } catch {
        // Will show empty list — user can retry by closing/reopening
      }
      if (!cancelled) setBanksLoading(false);
    })();
    return () => { cancelled = true; };
  }, [getAccessToken]);

  const filteredBanks = bankSearchQuery
    ? banks.filter((b) => b.name.toLowerCase().includes(bankSearchQuery.toLowerCase()))
    : banks;

  const handleSelectBank = (bank: WithdrawalBankNetwork) => {
    setSelectedBank(bank);
    setShowBankModal(false);
    setStep('account');
    setTimeout(() => accountRef.current?.focus(), 300);
  };

  const handleAccountNext = async () => {
    if (accountNumber.length < 10) {
      Alert.alert('Invalid', 'Please enter a valid 10-digit account number');
      return;
    }
    if (!selectedBank) return;

    setVerifying(true);
    try {
      const accessToken = await getAccessTokenWithRetry(getAccessToken);
      if (!accessToken) throw new Error('Not authenticated');
      const res = await verifyWithdrawalBankAccount({
        accessToken,
        accountNumber,
        networkId: getBankId(selectedBank),
      });
      if (!res.bankAccount.accountName) {
        Alert.alert(
          'Account not found',
          'We could not find that account. Check the account number and bank, then try again.',
        );
        return;
      }
      setAccountName(res.bankAccount.accountName);
      setStep('amount');
      setTimeout(() => amountRef.current?.focus(), 300);
    } catch (err) {
      Alert.alert(
        'Verification failed',
        err instanceof Error ? err.message : 'Could not verify account. Please check the details and try again.',
      );
    } finally {
      setVerifying(false);
    }
  };

  const handleAmountNext = () => {
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) {
      Alert.alert('Invalid', 'Please enter a valid amount');
      return;
    }
    if (numAmount > balanceNgn) {
      Alert.alert('Insufficient balance', `Your available balance is ${formatNgn(balanceNgn)}`);
      return;
    }
    setStep('confirm');
  };

  const handleConfirm = async () => {
    if (!selectedBank) return;
    setSubmitting(true);
    try {
      const accessToken = await getAccessTokenWithRetry(getAccessToken);
      if (!accessToken) throw new Error('Not authenticated');
      const response = await createWalletWithdrawal({
        accessToken,
        amountNgn: parseFloat(amount),
        bankAccount: {
          accountNumber,
          accountName,
          networkId: getBankId(selectedBank),
        },
      });

      const created = response.withdrawal;
      if (created && FAILED_WITHDRAWAL_STATUSES.includes(created.status)) {
        throw new Error(
          created.failureReason ??
            'The withdrawal was rejected. Your balance has not been deducted.',
        );
      }

      // Wait for the bank's answer before declaring an outcome.
      const outcome = created
        ? await waitForWithdrawalOutcome({ accessToken, withdrawalId: created.id })
        : null;
      // Whatever the outcome, the balance moved (reserved, settled, or
      // released) — the cached overview is stale the moment we know it.
      invalidateWalletCache();

      if (outcome && FAILED_WITHDRAWAL_STATUSES.includes(outcome.status)) {
        Alert.alert(
          'Withdrawal failed',
          outcome.failureReason ??
            'The bank transfer did not go through. Your balance has been refunded.',
        );
        return;
      }

      if (outcome?.status === 'SETTLED') {
        Alert.alert(
          'Withdrawal sent',
          `${formatNgn(parseFloat(amount))} has been sent to ${accountName} at ${selectedBank.name}`,
          [{ text: 'Done', onPress: () => router.back() }],
        );
        return;
      }

      Alert.alert(
        'Withdrawal processing',
        `${formatNgn(parseFloat(amount))} is on its way to ${accountName} at ${selectedBank.name}. We'll update your wallet once the bank confirms.`,
        [{ text: 'Done', onPress: () => router.back() }],
      );
    } catch (err) {
      Alert.alert(
        'Withdrawal failed',
        err instanceof Error ? err.message : 'Something went wrong. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleBack = () => {
    if (step === 'bank') {
      router.back();
    } else if (step === 'account') {
      setStep('bank');
    } else if (step === 'amount') {
      setStep('account');
    } else {
      setStep('amount');
    }
  };

  const stepTitle = {
    bank: 'Select bank',
    account: 'Account number',
    amount: 'Enter amount',
    confirm: 'Confirm withdrawal',
  }[step];

  return (
    <AppScreen scroll contentStyle={styles.container} keyboardOffset={theme.spacing.lg}>
      <View style={styles.flex}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={handleBack} hitSlop={12} style={[styles.backBtn, isDark && { backgroundColor: theme.colors.darkSurface }]}>
            <BackIcon />
          </Pressable>
          <AppText variant="h1" numberOfLines={1} style={styles.flex}>Withdraw</AppText>
        </View>

        {/* Step indicator — the connectors flex so four steps fit any width */}
        <View style={styles.stepRow}>
          {(['bank', 'account', 'amount', 'confirm'] as Step[]).map((s, i) => (
            <View key={s} style={[styles.stepItemWrap, i < 3 && styles.stepItemWrapGrow]}>
              <View style={[
                styles.stepDot,
                s === step && styles.stepDotActive,
                (['bank', 'account', 'amount', 'confirm'] as Step[]).indexOf(step) > i && styles.stepDotDone,
              ]} />
              {i < 3 && <View style={[
                styles.stepLine,
                (['bank', 'account', 'amount', 'confirm'] as Step[]).indexOf(step) > i && styles.stepLineDone,
              ]} />}
            </View>
          ))}
        </View>

        <AppText variant="h2" style={styles.stepTitle} numberOfLines={2}>{stepTitle}</AppText>

        {/* ── Step: Select Bank ── */}
        {step === 'bank' && (
          <View style={styles.stepContent}>
            <Pressable
              onPress={() => setShowBankModal(true)}
              style={[styles.selectField, isDark && { backgroundColor: theme.colors.darkSurface, borderColor: theme.colors.darkBorder }]}
            >
              <BankIcon />
              <AppText
                variant="body"
                color={selectedBank ? (isDark ? theme.colors.offWhite : theme.colors.black) : theme.colors.muted}
                style={styles.selectText}
                numberOfLines={2}
              >
                {selectedBank ? selectedBank.name : 'Choose your bank'}
              </AppText>
              <ChevronDownIcon />
            </Pressable>

            {selectedBank && (
              <Pressable
                onPress={() => setStep('account')}
                style={({ pressed }) => [styles.nextBtn, pressed && styles.btnPressed]}
              >
                <AppText variant="label" color={theme.colors.white}>Continue</AppText>
              </Pressable>
            )}
          </View>
        )}

        {/* ── Step: Account Number ── */}
        {step === 'account' && (
          <View style={styles.stepContent}>
            <View style={styles.bankChip}>
              <BankIcon size={16} />
              <AppText variant="bodySmall" color={theme.colors.muted}>{selectedBank?.name}</AppText>
            </View>

            <View style={[styles.inputWrap, isDark && { backgroundColor: theme.colors.darkSurface, borderColor: theme.colors.darkBorder }]}>
              <AppText variant="bodySmall" color={theme.colors.muted} style={styles.inputLabel}>
                Account number
              </AppText>
              <TextInput
                ref={accountRef}
                style={[
                  styles.input,
                  { fontSize: responsive.font(18), lineHeight: responsive.font(24) },
                  isDark && { color: theme.colors.offWhite },
                ]}
                value={accountNumber}
                onChangeText={(t) => setAccountNumber(t.replace(/\D/g, '').slice(0, 10))}
                placeholder="0123456789"
                placeholderTextColor={theme.colors.mutedLight}
                keyboardType="number-pad"
                maxLength={10}
                autoFocus
              />
            </View>

            {accountNumber.length === 10 && (
              <Pressable
                onPress={handleAccountNext}
                disabled={verifying}
                style={({ pressed }) => [styles.nextBtn, pressed && styles.btnPressed, verifying && { opacity: 0.6 }]}
              >
                {verifying ? (
                  <ActivityIndicator color={theme.colors.white} />
                ) : (
                  <AppText variant="label" color={theme.colors.white}>Verify & continue</AppText>
                )}
              </Pressable>
            )}
          </View>
        )}

        {/* ── Step: Amount ── */}
        {step === 'amount' && (
          <View style={styles.stepContent}>
            <View style={styles.bankChip}>
              <AppText variant="bodySmall" color={theme.colors.muted}>
                {selectedBank?.name} — {accountNumber}
              </AppText>
            </View>
            <View style={styles.resolvedName}>
              <CheckIcon />
              <AppText variant="bodyMedium">{accountName}</AppText>
            </View>

            <View style={[styles.inputWrap, isDark && { backgroundColor: theme.colors.darkSurface, borderColor: theme.colors.darkBorder }]}>
              <AppText variant="bodySmall" color={theme.colors.muted} style={styles.inputLabel}>
                Amount (NGN)
              </AppText>
              <TextInput
                ref={amountRef}
                style={[
                  styles.input,
                  styles.amountInput,
                  { fontSize: responsive.font(28), lineHeight: responsive.font(36) },
                  isDark && { color: theme.colors.offWhite },
                ]}
                value={amount}
                onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ''))}
                placeholder="0.00"
                placeholderTextColor={theme.colors.mutedLight}
                keyboardType="decimal-pad"
                autoFocus
              />
            </View>

            <AppText variant="bodySmall" color={theme.colors.muted}>
              Available: {formatNgn(balanceNgn)}
            </AppText>

            {parseFloat(amount) > 0 && (
              <Pressable
                onPress={handleAmountNext}
                style={({ pressed }) => [styles.nextBtn, pressed && styles.btnPressed]}
              >
                <AppText variant="label" color={theme.colors.white}>Review</AppText>
              </Pressable>
            )}
          </View>
        )}

        {/* ── Step: Confirm ── */}
        {step === 'confirm' && (
          <View style={styles.stepContent}>
            <View style={[styles.confirmCard, isDark && { backgroundColor: theme.colors.darkSurface }]}>
              <View style={styles.confirmRow}>
                <AppText variant="bodySmall" color={theme.colors.muted} style={styles.confirmLabel}>Bank</AppText>
                <AppText variant="bodyMedium" style={styles.confirmValue} numberOfLines={2}>
                  {selectedBank?.name}
                </AppText>
              </View>
              <View style={styles.confirmDivider} />
              <View style={styles.confirmRow}>
                <AppText variant="bodySmall" color={theme.colors.muted} style={styles.confirmLabel}>Account</AppText>
                <AppText variant="bodyMedium" style={styles.confirmValue} numberOfLines={1}>
                  {accountNumber}
                </AppText>
              </View>
              <View style={styles.confirmDivider} />
              <View style={styles.confirmRow}>
                <AppText variant="bodySmall" color={theme.colors.muted} style={styles.confirmLabel}>Name</AppText>
                <AppText variant="bodyMedium" style={styles.confirmValue} numberOfLines={2}>
                  {accountName}
                </AppText>
              </View>
              <View style={styles.confirmDivider} />
              <View style={styles.confirmRow}>
                <AppText variant="bodySmall" color={theme.colors.muted} style={styles.confirmLabel}>Amount</AppText>
                <AppText
                  variant="h2"
                  color={theme.colors.orange}
                  style={styles.confirmValue}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                  numberOfLines={1}>
                  {formatNgn(parseFloat(amount))}
                </AppText>
              </View>
            </View>

            <Pressable
              onPress={handleConfirm}
              disabled={submitting}
              style={({ pressed }) => [styles.confirmBtn, pressed && styles.btnPressed, submitting && { opacity: 0.6 }]}
            >
              {submitting ? (
                <ActivityIndicator color={theme.colors.white} />
              ) : (
                <AppText variant="label" color={theme.colors.white}>Confirm withdrawal</AppText>
              )}
            </Pressable>
          </View>
        )}
      </View>

      {/* ── Bank selection modal ── */}
      <Modal visible={showBankModal} animationType="slide" transparent onRequestClose={() => setShowBankModal(false)}>
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContent,
              isDark && { backgroundColor: theme.colors.black },
              {
                // Leave room for the keyboard so the search results stay visible.
                maxHeight: responsive.height - keyboardHeight - insets.top - responsive.scale(40),
                paddingBottom: keyboardHeight > 0 ? theme.spacing.md : Math.max(insets.bottom, 20),
                marginBottom: keyboardHeight,
              },
            ]}>
            <View style={styles.modalHeader}>
              <AppText variant="h2">Select bank</AppText>
              <Pressable onPress={() => setShowBankModal(false)} hitSlop={12}>
                <AppText variant="label" color={theme.colors.orange}>Close</AppText>
              </Pressable>
            </View>

            {/* Search */}
            <View style={[styles.searchWrap, isDark && { backgroundColor: theme.colors.darkSurface, borderColor: theme.colors.darkBorder }]}>
              <SearchIcon />
              <TextInput
                style={styles.searchInput}
                value={bankSearchQuery}
                onChangeText={setBankSearchQuery}
                placeholder="Search banks..."
                placeholderTextColor={theme.colors.mutedLight}
                autoFocus
              />
            </View>

            {banksLoading ? (
              <ActivityIndicator size="large" color={theme.colors.orange} style={{ marginTop: 40, marginBottom: 40 }} />
            ) : (
              <FlatList
                data={filteredBanks}
                keyExtractor={(item, index) => getBankId(item) || String(index)}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                nestedScrollEnabled
                ListEmptyComponent={
                  <AppText variant="body" color={theme.colors.muted} style={{ textAlign: 'center', marginTop: 30 }}>
                    No banks found
                  </AppText>
                }
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => handleSelectBank(item)}
                    style={({ pressed }) => [
                      styles.bankItem,
                      pressed && { backgroundColor: theme.colors.orangeLight },
                      selectedBank && getBankId(selectedBank) === getBankId(item) && styles.bankItemSelected,
                    ]}
                  >
                    <View style={styles.bankIconWrap}>
                      <BankIcon size={18} />
                    </View>
                    <AppText variant="body" style={styles.bankName} numberOfLines={2}>{item.name}</AppText>
                    {selectedBank && getBankId(selectedBank) === getBankId(item) && <CheckIcon />}
                  </Pressable>
                )}
              />
            )}
          </View>
        </View>
      </Modal>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flex: 1,
    paddingTop: theme.spacing.lg,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 20,
  },
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

  // Step indicator
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  stepItemWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepItemWrapGrow: {
    flex: 1,
  },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.borderLight,
    borderWidth: 1.5,
    borderColor: theme.colors.black,
  },
  stepDotActive: {
    backgroundColor: theme.colors.orange,
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  stepDotDone: {
    backgroundColor: theme.colors.orange,
  },
  stepLine: {
    flex: 1,
    minWidth: 16,
    height: 2,
    backgroundColor: theme.colors.borderLight,
    marginHorizontal: 4,
  },
  stepLineDone: {
    backgroundColor: theme.colors.orange,
  },
  stepTitle: {
    marginBottom: 20,
  },

  // Step content
  stepContent: {
    gap: 16,
  },

  // Select field
  selectField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.colors.white,
    borderRadius: theme.radii.sm,
    padding: 16,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    ...theme.shadows.subtle,
  },
  selectText: {
    flex: 1,
  },

  // Bank chip
  bankChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.orangeLight,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },

  // Resolved name
  resolvedName: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  // Input
  inputWrap: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.radii.sm,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    padding: 16,
    gap: 8,
    ...theme.shadows.subtle,
  },
  inputLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    fontFamily: 'ClashDisplay_600Semibold',
    fontSize: 18,
    color: theme.colors.black,
    padding: 0,
  },
  amountInput: {
    fontSize: 28,
    fontFamily: 'ClashDisplay_700Bold',
  },

  // Next button
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
  btnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },

  // Confirm card
  confirmCard: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.radii.md,
    padding: 20,
    gap: 0,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    ...theme.shadows.card,
  },
  confirmRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: 14,
  },
  confirmLabel: {
    flexShrink: 0,
  },
  confirmValue: {
    flex: 1,
    textAlign: 'right',
  },
  confirmDivider: {
    height: 1,
    backgroundColor: theme.colors.borderLight,
  },
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

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: theme.colors.offWhite,
    borderTopLeftRadius: theme.radii.xl,
    borderTopRightRadius: theme.radii.xl,
    borderWidth: theme.borders.thick,
    borderBottomWidth: 0,
    borderColor: theme.colors.black,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingBottom: 12,
  },

  // Search
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: theme.colors.white,
    borderRadius: theme.radii.sm,
    marginHorizontal: 20,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'ClashDisplay_500Medium',
    fontSize: 14,
    color: theme.colors.black,
    padding: 0,
  },

  // Bank list item
  bankItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  bankItemSelected: {
    backgroundColor: theme.colors.orangeLight,
  },
  bankIconWrap: {
    width: 36,
    height: 36,
    borderRadius: theme.radii.xs,
    backgroundColor: theme.colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.black,
  },
  bankName: {
    flex: 1,
  },
});
