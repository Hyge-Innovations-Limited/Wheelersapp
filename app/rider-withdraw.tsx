import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { KeyboardShiftView } from "@/components/keyboard-shift-view";
import {
  RBack,
  RButton,
  RCard,
  RIconDot,
  RInput,
  RLink,
  RScreen,
  RText,
  rider,
} from "@/components/rider/kit";
import { money } from "@/components/rider/wallet-format";
import { useWalletPin } from "@/components/wallet-pin-sheet";
import { getAccessTokenWithRetry } from "@/lib/access-token";
import {
  createWalletWithdrawal,
  FAILED_WITHDRAWAL_STATUSES,
  getWithdrawalBankNetworks,
  isBackendConfigured,
  type WithdrawalBankNetwork,
  verifyWithdrawalBankAccount,
  waitForWithdrawalOutcome,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { createIdempotencyKey } from "@/lib/idempotency";
import { useWalletOverview } from "@/lib/wallet-overview";
import { minWithdrawalOf, withdrawalBreakdown, withdrawalFeeOf } from "@/lib/withdrawal-fee";

type BlockingLoader = { title: string; message: string } | null;

/** The bank account a withdrawal goes to: the saved one, or one just verified. */
type PayoutAccount = {
  accountNumber: string;
  accountName: string;
  bankName: string;
  networkId: string;
};

type Outcome = { settled: boolean; receivedNgn: number; account: PayoutAccount };

// There is deliberately NO minimum-withdrawal constant here. The app used to
// mirror the backend's floor, and the copy went stale the day the provider
// changed — riders were refused ₦4,000 withdrawals the server would have
// paid. The server owns that rule and its message is shown as-is.

/** Round amounts offered as one-tap choices, when the balance allows them. */
const QUICK_AMOUNTS = [1000, 2000, 5000, 10000, 20000, 50000];

function parseNgnAmount(value: string): number | null {
  const digitsOnly = value.replace(/\D/g, "");
  if (!digitsOnly) {
    return null;
  }

  const amount = Number(digitsOnly);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

export default function RiderWithdrawScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { getAccessToken, isReady } = useAuth();
  const pinAccessToken = useCallback(() => getAccessTokenWithRetry(getAccessToken), [getAccessToken]);
  const pinGate = useWalletPin(pinAccessToken);
  const { overview, refresh: refreshWalletOverview } = useWalletOverview();

  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [payoutAccount, setPayoutAccount] = useState<PayoutAccount | null>(null);
  const [isBankSheetVisible, setBankSheetVisible] = useState(false);
  const [isWithdrawConfirmVisible, setWithdrawConfirmVisible] = useState(false);
  const [isCreatingWithdrawal, setCreatingWithdrawal] = useState(false);
  const [isLoadingBankNetworks, setLoadingBankNetworks] = useState(false);
  const [isVerifyingBankAccount, setVerifyingBankAccount] = useState(false);
  const [blockingLoader, setBlockingLoader] = useState<BlockingLoader>(null);
  const [bankSearchQuery, setBankSearchQuery] = useState("");
  const [bankListError, setBankListError] = useState<string | null>(null);
  const [withdrawBankNetworks, setWithdrawBankNetworks] = useState<WithdrawalBankNetwork[]>([]);
  const [selectedWithdrawBank, setSelectedWithdrawBank] = useState<WithdrawalBankNetwork | null>(null);
  const [withdrawAccountNumber, setWithdrawAccountNumber] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const lastBankLookupKeyRef = useRef<string | null>(null);
  const hasPrefetchedBanksRef = useRef(false);
  const withdrawalIdempotencyKeyRef = useRef<string | null>(null);
  const accountChosenRef = useRef(false);
  const accountNumberRef = useRef<TextInput>(null);

  const availableWithdrawalBalanceNgn = overview?.balanceNgn ?? 0;
  // Wheelers' fee on every withdrawal, taken from the amount, as the server states it.
  const withdrawalFeeNgn = withdrawalFeeOf(overview);
  const minWithdrawalNgn = minWithdrawalOf(overview);

  // The account the last withdrawal went to is used unless the rider changes
  // it. Applied once, and never over a choice the rider has made.
  const saved = overview?.payoutAccount ?? null;
  useEffect(() => {
    if (!saved || accountChosenRef.current) return;
    accountChosenRef.current = true;
    setPayoutAccount({
      accountNumber: saved.accountNumber,
      accountName: saved.accountName,
      bankName: saved.bankName,
      networkId: saved.networkId,
    });
  }, [saved]);

  const handleWithdrawAmountChange = (value: string) => {
    withdrawalIdempotencyKeyRef.current = null;
    const digitsOnly = value.replace(/\D/g, "");

    if (!digitsOnly) {
      setWithdrawAmount("");
      return;
    }

    setWithdrawAmount(Number(digitsOnly).toLocaleString("en-NG"));
  };

  const loadWithdrawalBankNetworks = async (query?: string) => {
    const normalizedQuery = query?.trim().toLowerCase() ?? "";
    const lookupKey = `NG:${normalizedQuery}`;

    if (!isBackendConfigured()) {
      return;
    }

    if (!isReady) {
      return;
    }

    if (isLoadingBankNetworks || lastBankLookupKeyRef.current === lookupKey) {
      return;
    }

    const accessToken = await getAccessTokenWithRetry(getAccessToken);
    if (!accessToken) {
      return;
    }

    lastBankLookupKeyRef.current = lookupKey;
    setLoadingBankNetworks(true);
    setBankListError(null);

    try {
      const response = await getWithdrawalBankNetworks({
        accessToken,
        country: "NG",
        query: normalizedQuery || undefined,
        limit: normalizedQuery ? 100 : 40,
      });
      setWithdrawBankNetworks(response.items);
    } catch (error) {
      lastBankLookupKeyRef.current = null;
      setBankListError(
        error instanceof Error
          ? error.message
          : "Could not load the supported withdrawal banks.",
      );
    } finally {
      setLoadingBankNetworks(false);
    }
  };

  useEffect(() => {
    if (!isReady || !isBankSheetVisible) {
      return;
    }

    const timeout = setTimeout(() => {
      void loadWithdrawalBankNetworks(bankSearchQuery);
    }, 90);

    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bankSearchQuery, isBankSheetVisible, isReady]);

  useEffect(() => {
    if (!isReady || !isBackendConfigured() || hasPrefetchedBanksRef.current) {
      return;
    }

    hasPrefetchedBanksRef.current = true;
    void loadWithdrawalBankNetworks("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady]);

  const openBankSheet = () => {
    setBankSheetVisible(true);
    void loadWithdrawalBankNetworks(bankSearchQuery);
  };

  const closeBankSheet = () => {
    if (isVerifyingBankAccount) {
      return;
    }

    setBankSheetVisible(false);
  };

  const closeWithdrawConfirm = () => {
    if (isCreatingWithdrawal) {
      return;
    }

    setWithdrawConfirmVisible(false);
  };

  /** Bank and account number are in: ask the bank whose account it is. */
  const handleVerifyBankAccount = async () => {
    const bankAccountNumber = withdrawAccountNumber.replace(/\D/g, "");
    const bankNetworkId = selectedWithdrawBank?.id ?? "";

    if (!bankNetworkId || !bankAccountNumber) {
      Alert.alert(
        "Bank details required",
        "Choose a bank and enter your account number to continue.",
      );
      return;
    }

    if (bankAccountNumber.length < 10) {
      Alert.alert(
        "Account number required",
        "Enter a valid account number before continuing.",
      );
      return;
    }

    if (!isBackendConfigured()) {
      Alert.alert("Withdraw", "Backend unavailable right now.");
      return;
    }

    if (!isReady) {
      Alert.alert("Withdraw", "Wait a moment for your account to finish loading.");
      return;
    }

    const accessToken = await getAccessTokenWithRetry(getAccessToken);
    if (!accessToken) {
      Alert.alert("Withdraw", "Could not verify your session right now.");
      return;
    }

    setVerifyingBankAccount(true);

    try {
      const response = await verifyWithdrawalBankAccount({
        accessToken,
        accountNumber: bankAccountNumber,
        networkId: bankNetworkId,
      });

      if (!response.bankAccount.accountName || !response.bankAccount.bankName) {
        throw new Error("We could not verify that bank account name. Check the number and bank.");
      }

      withdrawalIdempotencyKeyRef.current = null;
      accountChosenRef.current = true;
      setPayoutAccount({
        accountNumber: response.bankAccount.accountNumber,
        accountName: response.bankAccount.accountName,
        bankName: response.bankAccount.bankName,
        networkId: response.bankAccount.networkId,
      });
      setBankSheetVisible(false);
    } catch (error) {
      Alert.alert(
        "Verification failed",
        error instanceof Error
          ? error.message
          : "Could not verify the bank account.",
      );
    } finally {
      setVerifyingBankAccount(false);
    }
  };

  /** The main button: check the amount and the account, then show what will happen. */
  const handleWithdrawContinue = () => {
    const amountNgn = parseNgnAmount(withdrawAmount);

    if (!amountNgn) {
      Alert.alert(
        "Amount required",
        "Enter the amount you want to withdraw in Naira.",
      );
      return;
    }

    if (minWithdrawalNgn > 0 && amountNgn < minWithdrawalNgn) {
      Alert.alert(
        "Amount too small",
        `The least you can withdraw is ${money(minWithdrawalNgn)}, including the ${money(withdrawalFeeNgn)} withdrawal fee.`,
      );
      return;
    }

    if (amountNgn > availableWithdrawalBalanceNgn) {
      Alert.alert(
        "Insufficient balance",
        `You have insufficient balance for this withdrawal. Available balance is ${money(
          Math.round(availableWithdrawalBalanceNgn),
        )}.`,
      );
      return;
    }

    if (!payoutAccount) {
      Alert.alert(
        "Bank details required",
        "Choose a bank and enter your account number to continue.",
        [{ text: "OK", onPress: openBankSheet }],
      );
      return;
    }

    setWithdrawConfirmVisible(true);
  };

  const handleConfirmWithdrawal = async () => {
    const amountNgn = parseNgnAmount(withdrawAmount);

    if (!amountNgn || !payoutAccount) {
      Alert.alert(
        "Withdrawal details missing",
        "Verify the bank account again before proceeding.",
      );
      return;
    }

    if (amountNgn > availableWithdrawalBalanceNgn) {
      Alert.alert(
        "Insufficient balance",
        `You have insufficient balance for this withdrawal. Available balance is ${money(
          Math.round(availableWithdrawalBalanceNgn),
        )}.`,
      );
      return;
    }

    if (!isBackendConfigured()) {
      Alert.alert("Withdraw", "Backend unavailable right now.");
      return;
    }

    if (!isReady) {
      Alert.alert("Withdraw", "Wait a moment for your account to finish loading.");
      return;
    }

    const accessToken = await getAccessTokenWithRetry(getAccessToken);
    if (!accessToken) {
      Alert.alert("Withdraw", "Could not verify your session right now.");
      return;
    }

    setWithdrawConfirmVisible(false);
    // Two modals cannot be on screen at once: let the confirm sheet finish
    // closing before the PIN sheet opens.
    await new Promise((resolve) => setTimeout(resolve, 350));

    // No PIN, no withdrawal. The sheet creates one the first time, and
    // explains a lockout or a freeze instead of handing a PIN back.
    let pin = await pinGate.ask();
    if (!pin) {
      setWithdrawConfirmVisible(true);
      return;
    }
    pinGate.done();

    const sendingLoader = {
      title: "Sending withdrawal",
      message: "Submitting your withdrawal request now.",
    };
    setBlockingLoader(sendingLoader);
    setCreatingWithdrawal(true);

    try {
      let response;
      for (;;) {
        try {
          response = await createWalletWithdrawal({
            accessToken,
            pin,
            idempotencyKey:
              withdrawalIdempotencyKeyRef.current ??
              (withdrawalIdempotencyKeyRef.current = createIdempotencyKey(
                "wallet-withdrawal",
              )),
            amountNgn,
            bankAccount: {
              accountNumber: payoutAccount.accountNumber,
              accountName: payoutAccount.accountName,
              networkId: payoutAccount.networkId,
            },
          });
          break;
        } catch (pinError) {
          // A wrong PIN is not a failed withdrawal: nothing was reserved.
          if (!pinGate.isPinError(pinError)) throw pinError;
          setBlockingLoader(null);
          const retry = await pinGate.ask(pinError instanceof Error ? pinError.message : undefined);
          if (!retry) {
            setWithdrawConfirmVisible(true);
            return;
          }
          pin = retry;
          pinGate.done();
          setBlockingLoader(sendingLoader);
        }
      }

      const created = response.withdrawal;
      if (created && FAILED_WITHDRAWAL_STATUSES.includes(created.status)) {
        throw new Error(
          created.failureReason ??
            "The withdrawal was rejected. Your balance has not been deducted.",
        );
      }

      setBlockingLoader({
        title: "Confirming with your bank",
        message: "Waiting for the bank to confirm the transfer.",
      });

      const result = created
        ? await waitForWithdrawalOutcome({ accessToken, withdrawalId: created.id })
        : null;

      if (result && FAILED_WITHDRAWAL_STATUSES.includes(result.status)) {
        await refreshWalletOverview();
        throw new Error(
          result.failureReason ??
            "The bank transfer did not go through. Your balance has been refunded.",
        );
      }

      await refreshWalletOverview();
      withdrawalIdempotencyKeyRef.current = null;

      // What the bank gets: the server's figure when it gives one, else the amount less the fee.
      const received =
        response?.withdrawal?.payoutNgn ??
        withdrawalBreakdown(amountNgn, withdrawalFeeNgn).receiveNgn;
      setOutcome({
        settled: result?.status === "SETTLED",
        receivedNgn: received,
        account: payoutAccount,
      });
    } catch (error) {
      setWithdrawConfirmVisible(true);
      Alert.alert(
        "Withdrawal failed",
        error instanceof Error
          ? error.message
          : "Could not create the wallet withdrawal.",
      );
    } finally {
      setBlockingLoader(null);
      setCreatingWithdrawal(false);
    }
  };

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/rider/wallet");
  };

  const filteredWithdrawalBanks = withdrawBankNetworks.filter((bank) => {
    const query = bankSearchQuery.trim().toLowerCase();
    if (!query) {
      return true;
    }

    return (
      bank.name.toLowerCase().includes(query) ||
      (bank.code?.toLowerCase().includes(query) ?? false)
    );
  });

  const displayedWithdrawAmount = parseNgnAmount(withdrawAmount);
  const breakdown = displayedWithdrawAmount
    ? withdrawalBreakdown(displayedWithdrawAmount, withdrawalFeeNgn)
    : null;

  // One-tap choices: only amounts the server would accept from this balance.
  const allNgn = Math.floor(availableWithdrawalBalanceNgn);
  const allowed = (amount: number) =>
    amount > 0 &&
    amount <= availableWithdrawalBalanceNgn &&
    (minWithdrawalNgn <= 0 || amount >= minWithdrawalNgn);
  const quickChoices: { amount: number; label: string }[] = [
    ...QUICK_AMOUNTS.filter((amount) => amount < allNgn && allowed(amount))
      .slice(-2)
      .map((amount) => ({ amount, label: money(amount) })),
    ...(allowed(allNgn) ? [{ amount: allNgn, label: "All" }] : []),
  ];

  const remainingNgn =
    displayedWithdrawAmount && displayedWithdrawAmount <= availableWithdrawalBalanceNgn
      ? availableWithdrawalBalanceNgn - displayedWithdrawAmount
      : null;
  const amountFontSize =
    withdrawAmount.length <= 6 ? 54 : withdrawAmount.length <= 9 ? 42 : 32;

  const outcomeView = outcome ? (
      <RScreen contentStyle={styles.outcome}>
        <StatusBar backgroundColor={rider.colors.cream} style="dark" />
        <View accessibilityLiveRegion="polite" style={styles.outcomeBody}>
          <View style={styles.outcomeIcon}>
            <Ionicons
              color={rider.colors.green}
              name={outcome.settled ? "checkmark" : "time-outline"}
              size={40}
            />
          </View>
          <RText accessibilityRole="header" style={styles.centered} variant="title">
            {outcome.settled ? "Withdrawal sent" : "Withdrawal on its way"}
          </RText>
          <RText color={rider.colors.muted} style={styles.centered}>
            {outcome.settled
              ? `${money(outcome.receivedNgn)} sent to your bank.`
              : `${money(outcome.receivedNgn)} is on its way. We'll update your wallet once the bank confirms.`}
          </RText>
          <RText color={rider.colors.muted} style={styles.centered} variant="small">
            {`${outcome.account.bankName} · ending ${outcome.account.accountNumber.slice(-4)} · ${outcome.account.accountName}`}
          </RText>
        </View>
        <RButton accessibilityLabel="Done" onPress={goBack} title="Done" variant="dark" />
      </RScreen>
  ) : null;

  return (
    <>
      {outcomeView ?? (
      <RScreen contentStyle={styles.container} scroll>
        <StatusBar backgroundColor={rider.colors.cream} style="dark" />

        <View style={styles.header}>
          <RBack onPress={goBack} />
          <RText accessibilityRole="header" style={styles.headerTitle} variant="title">
            Withdraw
          </RText>
        </View>
        <RText color={rider.colors.muted}>Send money from your wallet to your bank account.</RText>

        <RCard style={styles.amountCard} tone="ink">
          <View style={styles.amountTop}>
            <RText color={rider.colors.onInkMuted} variant="small">
              Amount
            </RText>
            <Text maxFontSizeMultiplier={1.2} style={styles.balanceText}>
              Balance{" "}
              <Text style={styles.balanceValue}>
                {overview ? money(availableWithdrawalBalanceNgn) : "₦—"}
              </Text>
            </Text>
          </View>

          <View style={styles.amountRow}>
            <Text maxFontSizeMultiplier={1} style={[styles.amountFigure, { fontSize: amountFontSize }]}>
              ₦
            </Text>
            <TextInput
              accessibilityLabel="Amount to withdraw, in naira"
              keyboardType="number-pad"
              maxFontSizeMultiplier={1}
              onChangeText={handleWithdrawAmountChange}
              placeholder="0"
              placeholderTextColor={rider.colors.inkLine}
              selectionColor={rider.colors.orange}
              style={[styles.amountFigure, styles.amountInput, { fontSize: amountFontSize }]}
              value={withdrawAmount}
            />
          </View>

          {quickChoices.length > 0 ? (
            <View style={styles.quickRow}>
              {quickChoices.map((choice) => {
                const on = displayedWithdrawAmount === choice.amount;
                return (
                  <Pressable
                    accessibilityLabel={
                      choice.label === "All"
                        ? `Withdraw all, ${money(choice.amount)}`
                        : `Withdraw ${choice.label}`
                    }
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    key={choice.label}
                    onPress={() => handleWithdrawAmountChange(String(choice.amount))}
                    style={({ pressed }) => [
                      styles.quick,
                      on ? styles.quickOn : null,
                      pressed ? styles.pressed : null,
                    ]}>
                    <Text
                      maxFontSizeMultiplier={1.15}
                      numberOfLines={1}
                      style={[styles.quickText, on ? styles.quickTextOn : null]}>
                      {choice.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {withdrawalFeeNgn > 0 ? (
            <RText accessibilityLiveRegion="polite" color={rider.colors.onInkSoft} variant="small">
              {breakdown
                ? `${money(withdrawalFeeNgn)} withdrawal fee · you receive ${money(breakdown.receiveNgn)}`
                : `${money(withdrawalFeeNgn)} fee on every withdrawal`}
            </RText>
          ) : null}
        </RCard>

        <View style={styles.section}>
          <RText variant="label">BANK ACCOUNT</RText>
          <RCard style={styles.bankCard} tone="outline">
            <View style={styles.bankIcon}>
              <Ionicons color={rider.colors.orangeText} name="business-outline" size={20} />
            </View>
            <View style={styles.bankCopy}>
              <RText numberOfLines={1} variant="bodyBold">
                {payoutAccount
                  ? `${payoutAccount.bankName} · ending ${payoutAccount.accountNumber.slice(-4)}`
                  : "No bank account yet"}
              </RText>
              <RText color={rider.colors.muted} numberOfLines={1} variant="small">
                {payoutAccount ? payoutAccount.accountName : "Choose where the money goes."}
              </RText>
            </View>
            <Pressable
              accessibilityLabel={payoutAccount ? "Change bank account" : "Add a bank account"}
              accessibilityRole="button"
              hitSlop={6}
              onPress={openBankSheet}
              style={({ pressed }) => [styles.changeButton, pressed ? styles.pressed : null]}>
              <Text maxFontSizeMultiplier={1.15} style={styles.changeText}>
                {payoutAccount ? "Change" : "Add"}
              </Text>
            </Pressable>
          </RCard>
        </View>

        {remainingNgn !== null ? (
          <RText accessibilityLiveRegion="polite" color={rider.colors.muted} variant="small">
            {remainingNgn < 1
              ? "Your wallet balance will be ₦0."
              : `${money(remainingNgn)} will remain in your wallet.`}
          </RText>
        ) : null}

        <View style={styles.spacer} />

        <RButton
          accessibilityLabel={
            displayedWithdrawAmount ? `Withdraw ${money(displayedWithdrawAmount)}` : "Withdraw"
          }
          disabled={isCreatingWithdrawal}
          onPress={handleWithdrawContinue}
          title={displayedWithdrawAmount ? `Withdraw ${money(displayedWithdrawAmount)}` : "Withdraw"}
        />
        <RText color={rider.colors.muted} style={styles.centered} variant="caption">
          Transfers usually arrive within a few minutes.
        </RText>
      </RScreen>
      )}

      {/* Bank account: pick the bank, type the number, the bank names the owner. */}
      <Modal
        animationType="slide"
        onRequestClose={closeBankSheet}
        visible={isBankSheetVisible}>
        <KeyboardShiftView
          style={[
            styles.bankSheet,
            { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 },
          ]}>
          <View style={styles.header}>
            <RBack icon="close" label="Close" onPress={closeBankSheet} />
            <RText accessibilityRole="header" style={styles.headerTitle} variant="title">
              Bank account
            </RText>
          </View>

          {selectedWithdrawBank ? (
            <View style={styles.bankForm}>
              <RCard style={styles.bankCard} tone="card">
                <RIconDot name="business-outline" />
                <View style={styles.bankCopy}>
                  <RText color={rider.colors.muted} variant="small">
                    Bank
                  </RText>
                  <RText numberOfLines={2} variant="bodyBold">
                    {selectedWithdrawBank.name}
                  </RText>
                </View>
                <Pressable
                  accessibilityLabel="Choose a different bank"
                  accessibilityRole="button"
                  hitSlop={6}
                  onPress={() => {
                    withdrawalIdempotencyKeyRef.current = null;
                    setSelectedWithdrawBank(null);
                  }}
                  style={({ pressed }) => [styles.changeButton, pressed ? styles.pressed : null]}>
                  <Text maxFontSizeMultiplier={1.15} style={styles.changeText}>
                    Change
                  </Text>
                </Pressable>
              </RCard>

              <RInput
                hint="We check the name on the account before any money moves."
                keyboardType="number-pad"
                label="Account number"
                onChangeText={(value) => {
                  withdrawalIdempotencyKeyRef.current = null;
                  setWithdrawAccountNumber(value.replace(/\D/g, ""));
                }}
                placeholder="0123456789"
                ref={accountNumberRef}
                value={withdrawAccountNumber}
              />

              <RButton
                accessibilityLabel="Check account"
                loading={isVerifyingBankAccount}
                onPress={() => void handleVerifyBankAccount()}
                title="Check account"
                variant="dark"
              />
            </View>
          ) : (
            <>
              <RInput
                accessibilityLabel="Search bank"
                autoCapitalize="words"
                autoCorrect={false}
                onChangeText={setBankSearchQuery}
                placeholder="Search bank"
                value={bankSearchQuery}
              />
              <FlatList
                ListEmptyComponent={
                  isLoadingBankNetworks ? (
                    <View style={styles.bankListState}>
                      <ActivityIndicator color={rider.colors.orange} />
                    </View>
                  ) : (
                    <View style={styles.bankListState}>
                      <RText color={rider.colors.muted} style={styles.centered} variant="small">
                        {bankListError ?? "No banks matched your search."}
                      </RText>
                      {bankListError ? (
                        <RLink
                          accessibilityLabel="Try loading banks again"
                          color={rider.colors.orangeText}
                          onPress={() => void loadWithdrawalBankNetworks(bankSearchQuery)}
                          title="Try again"
                        />
                      ) : null}
                    </View>
                  )
                }
                data={filteredWithdrawalBanks}
                keyboardShouldPersistTaps="handled"
                keyExtractor={(bank) => bank.id}
                renderItem={({ item: bank }) => (
                  <Pressable
                    accessibilityLabel={bank.name}
                    accessibilityRole="button"
                    onPress={() => {
                      withdrawalIdempotencyKeyRef.current = null;
                      setSelectedWithdrawBank(bank);
                      setTimeout(() => accountNumberRef.current?.focus(), 300);
                    }}
                    style={({ pressed }) => [styles.bankRow, pressed ? styles.pressed : null]}>
                    <View style={styles.bankCopy}>
                      <RText numberOfLines={1} variant="bodyBold">
                        {bank.name}
                      </RText>
                    </View>
                    <Ionicons color={rider.colors.muted} name="chevron-forward" size={18} />
                  </Pressable>
                )}
                showsVerticalScrollIndicator={false}
                style={styles.bankList}
              />
            </>
          )}
        </KeyboardShiftView>
      </Modal>

      {/* Confirm: what leaves the wallet, the fee, what the bank receives, and where. */}
      <Modal
        animationType="fade"
        onRequestClose={closeWithdrawConfirm}
        transparent
        visible={isWithdrawConfirmVisible}>
        <View style={styles.backdrop}>
          <View style={[styles.confirmSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.confirmHeader}>
              <View style={styles.bankCopy}>
                <RText accessibilityRole="header" variant="heading">
                  Confirm withdrawal
                </RText>
                <RText color={rider.colors.muted} variant="small">
                  Check the account details before you continue.
                </RText>
              </View>
              <RBack icon="close" label="Close" onPress={closeWithdrawConfirm} />
            </View>

            <RCard style={styles.receiveCard} tone="ink">
              <RText color={rider.colors.onInkMuted} variant="small">
                You receive
              </RText>
              <Text
                adjustsFontSizeToFit
                maxFontSizeMultiplier={1.1}
                numberOfLines={1}
                style={styles.receiveFigure}>
                {breakdown ? money(breakdown.receiveNgn) : "Pending"}
              </Text>
            </RCard>

            <RCard style={styles.detailCard}>
              {displayedWithdrawAmount ? (
                <DetailRow label="Amount" value={money(displayedWithdrawAmount)} />
              ) : null}
              {withdrawalFeeNgn > 0 ? (
                <DetailRow label="Withdrawal fee" value={`− ${money(withdrawalFeeNgn)}`} />
              ) : null}
              <DetailRow label="Bank name" value={payoutAccount?.bankName ?? "Pending"} />
              <DetailRow label="Account number" value={payoutAccount?.accountNumber ?? "Pending"} />
              <DetailRow last label="Account name" value={payoutAccount?.accountName ?? "Pending"} />
            </RCard>

            <RButton
              accessibilityLabel="Confirm withdrawal"
              disabled={isCreatingWithdrawal}
              onPress={() => void handleConfirmWithdrawal()}
              title="Confirm"
            />
            <RLink accessibilityLabel="Back" onPress={closeWithdrawConfirm} title="Back" />
          </View>
        </View>
      </Modal>

      {/* Waiting on the server, then on the bank. */}
      <Modal animationType="fade" transparent visible={blockingLoader != null}>
        <View style={[styles.backdrop, styles.loaderBackdrop]}>
          <View accessibilityLiveRegion="polite" style={styles.loaderCard}>
            <ActivityIndicator color={rider.colors.orange} size="large" />
            <RText style={styles.centered} variant="heading">
              {blockingLoader?.title ?? "Loading"}
            </RText>
            <RText color={rider.colors.muted} style={styles.centered} variant="small">
              {blockingLoader?.message ?? "Please wait a moment."}
            </RText>
          </View>
        </View>
      </Modal>

      {pinGate.sheet}
    </>
  );
}

function DetailRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.detailRow, last ? null : styles.detailDivider]}>
      <RText color={rider.colors.muted} variant="small">
        {label}
      </RText>
      <RText selectable style={styles.detailValue} variant="smallBold">
        {value}
      </RText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 16, paddingTop: 12, paddingBottom: 16 },
  pressed: { opacity: 0.72 },
  centered: { textAlign: "center", alignSelf: "center" },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  headerTitle: { flex: 1, fontSize: 26 },
  section: { gap: 8 },
  spacer: { flexGrow: 1, minHeight: 8 },

  amountCard: { padding: 20, borderRadius: 24, gap: 14 },
  amountTop: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 },
  balanceText: { fontFamily: rider.fonts.regular, fontSize: 14, color: rider.colors.onInkMuted },
  balanceValue: {
    fontFamily: rider.fonts.bold,
    color: rider.colors.cream,
    fontVariant: ["tabular-nums"],
  },
  amountRow: { flexDirection: "row", alignItems: "center", minHeight: 64 },
  amountFigure: {
    fontFamily: rider.fonts.display,
    letterSpacing: -1,
    color: rider.colors.orange,
    fontVariant: ["tabular-nums"],
  },
  amountInput: { flex: 1, minHeight: 64, padding: 0 },
  quickRow: { flexDirection: "row", gap: 10 },
  quick: {
    flex: 1,
    maxWidth: 110,
    height: 48,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: rider.colors.inkLine,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  quickOn: { borderColor: rider.colors.orange, backgroundColor: rider.colors.orange },
  quickText: {
    fontFamily: rider.fonts.bold,
    fontSize: 15,
    color: rider.colors.cream,
    fontVariant: ["tabular-nums"],
  },
  quickTextOn: { fontFamily: rider.fonts.heavy, color: rider.colors.ink },

  bankCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    borderRadius: rider.radius.lg,
  },
  bankIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: rider.colors.orangeSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  bankCopy: { flex: 1, minWidth: 0 },
  changeButton: { minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center" },
  changeText: {
    fontFamily: rider.fonts.bold,
    fontSize: 15,
    color: rider.colors.orangeText,
    textDecorationLine: "underline",
  },

  bankSheet: {
    flex: 1,
    backgroundColor: rider.colors.cream,
    paddingHorizontal: rider.gutter,
    gap: 16,
  },
  bankForm: { gap: 16 },
  bankList: { flex: 1 },
  bankListState: { alignItems: "center", gap: 4, paddingVertical: 32 },
  bankRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 56,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: rider.colors.line,
  },

  backdrop: { flex: 1, backgroundColor: "rgba(13,13,13,0.5)", justifyContent: "flex-end" },
  confirmSheet: {
    backgroundColor: rider.colors.cream,
    borderTopLeftRadius: rider.radius.sheet,
    borderTopRightRadius: rider.radius.sheet,
    paddingHorizontal: rider.gutter,
    paddingTop: 20,
    gap: 14,
  },
  confirmHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  receiveCard: { gap: 2 },
  receiveFigure: {
    fontFamily: rider.fonts.display,
    fontSize: 40,
    lineHeight: 46,
    letterSpacing: -1,
    color: rider.colors.orange,
    fontVariant: ["tabular-nums"],
  },
  detailCard: { paddingVertical: 4 },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    minHeight: 44,
    paddingVertical: 8,
  },
  detailDivider: { borderBottomWidth: 1, borderBottomColor: rider.colors.line },
  detailValue: { flex: 1, textAlign: "right" },

  loaderBackdrop: { justifyContent: "center", paddingHorizontal: rider.gutter },
  loaderCard: {
    backgroundColor: rider.colors.cream,
    borderRadius: rider.radius.xl,
    paddingHorizontal: 24,
    paddingVertical: 32,
    alignItems: "center",
    gap: 10,
  },

  outcome: { paddingTop: 12, paddingBottom: 16, gap: 16 },
  outcomeBody: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  outcomeIcon: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: rider.colors.greenSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
});
