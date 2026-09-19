import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useAuth } from "@/lib/auth";
import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppButton } from "@/components/app-button";
import { AppCard } from "@/components/app-card";
import { AppScreen } from "@/components/app-screen";
import { AppText } from "@/components/app-text";
import { SectionHeader } from "@/components/SectionHeader";
import { WalletBalanceCard } from "@/components/WalletBalanceCard";
import { KeyboardShiftView } from "@/components/keyboard-shift-view";
import { getAccessTokenWithRetry } from "@/lib/access-token";
import { createIdempotencyKey } from "@/lib/idempotency";
import {
  createWalletWithdrawal,
  FAILED_WITHDRAWAL_STATUSES,
  getWalletDepositInfo,
  getWithdrawalBankNetworks,
  isBackendConfigured,
  provisionVirtualAccount,
  type WalletDepositInfoResponse,
  type WithdrawalBankNetwork,
  verifyWithdrawalBankAccount,
  waitForWithdrawalOutcome,
} from "@/lib/api";
import { useWalletOverview } from "@/lib/wallet-overview";
import { theme } from "@/theme";

type WalletBlockingLoader =
  | {
      title: string;
      message: string;
    }
  | null;

const walletPages = [
  {
    id: "transactions",
    icon: "receipt-long",
    title: "View transactions",
    subtitle: "See wallet inflow and ride charges.",
  },
  {
    id: "pay-online",
    icon: "language",
    title: "Pay online",
    subtitle: "Choose card or bank transfer checkout.",
  },
] as const;

// There is deliberately NO minimum-withdrawal constant here. The app used to
// mirror the backend's floor, and the copy went stale the day the provider
// changed — riders were refused ₦4,000 withdrawals the server would have
// paid. The server owns that rule and its message is shown as-is.

function parseNgnAmount(value: string): number | null {
  const digitsOnly = value.replace(/\D/g, "");
  if (!digitsOnly) {
    return null;
  }

  const amount = Number(digitsOnly);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function formatWalletCurrencyAmount(currency: string, amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  const hasDecimals = Math.abs(rounded % 1) > 0;

  return `${currency} ${rounded.toLocaleString("en-NG", {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

export default function WalletScreen() {
  const router = useRouter();
  const { getAccessToken, isReady } = useAuth();
  const insets = useSafeAreaInsets();
  const {
    overview,
    refresh: refreshWalletOverview,
  } = useWalletOverview();
  const params = useLocalSearchParams<{
    depositAmount?: string | string[];
    redirectReason?: string | string[];
    rideName?: string | string[];
    itinerary?: string | string[];
  }>();
  const [depositAmount, setDepositAmount] = useState("");
  const [isDepositModalVisible, setDepositModalVisible] = useState(false);
  const [depositInfo, setDepositInfo] = useState<WalletDepositInfoResponse | null>(null);
  const [isLoadingDepositInfo, setLoadingDepositInfo] = useState(false);
  const [depositInfoError, setDepositInfoError] = useState<string | null>(null);
  const [isWithdrawModalVisible, setWithdrawModalVisible] = useState(false);
  const [isWithdrawConfirmVisible, setWithdrawConfirmVisible] = useState(false);
  const [isBankPickerVisible, setBankPickerVisible] = useState(false);
  const [isCreatingWithdrawal, setCreatingWithdrawal] = useState(false);
  const [isLoadingBankNetworks, setLoadingBankNetworks] = useState(false);
  const [isVerifyingBankAccount, setVerifyingBankAccount] = useState(false);
  const [blockingLoader, setBlockingLoader] = useState<WalletBlockingLoader>(
    null,
  );
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [bankSearchQuery, setBankSearchQuery] = useState("");
  const [withdrawBankNetworks, setWithdrawBankNetworks] = useState<
    WithdrawalBankNetwork[]
  >([]);
  const [selectedWithdrawBank, setSelectedWithdrawBank] =
    useState<WithdrawalBankNetwork | null>(null);
  const [withdrawAccountNumber, setWithdrawAccountNumber] = useState("");
  const [verifiedWithdrawAccount, setVerifiedWithdrawAccount] = useState<{
    accountNumber: string;
    accountName: string;
    bankName: string;
    networkId: string;
  } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const handledRedirectRef = useRef<string | null>(null);
  const lastBankLookupKeyRef = useRef<string | null>(null);
  const hasPrefetchedBanksRef = useRef(false);
  const withdrawalIdempotencyKeyRef = useRef<string | null>(null);
  const redirectReason = Array.isArray(params.redirectReason)
    ? params.redirectReason[0]
    : params.redirectReason;
  const itineraryParam = Array.isArray(params.itinerary)
    ? params.itinerary[0]
    : params.itinerary;

  useEffect(() => {
    if (!toastMessage) {
      return;
    }

    Animated.timing(toastOpacity, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();

    const timeout = setTimeout(() => {
      Animated.timing(toastOpacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          setToastMessage(null);
        }
      });
    }, 2800);

    return () => clearTimeout(timeout);
  }, [toastMessage, toastOpacity]);

  const showToast = (message: string) => {
    toastOpacity.setValue(0);
    setToastMessage(message);
  };

  useEffect(() => {
    const rawDepositAmount = Array.isArray(params.depositAmount)
      ? params.depositAmount[0]
      : params.depositAmount;
    const rideName = Array.isArray(params.rideName)
      ? params.rideName[0]
      : params.rideName;

    if (
      redirectReason !== "insufficient-funds" ||
      !rawDepositAmount ||
      handledRedirectRef.current === rawDepositAmount
    ) {
      return;
    }

    const numericAmount = Number(rawDepositAmount.replace(/\D/g, ""));

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return;
    }

    const formattedAmount = numericAmount.toLocaleString("en-NG");
    handledRedirectRef.current = rawDepositAmount;
    toastOpacity.setValue(0);
    setDepositAmount(formattedAmount);
    setDepositModalVisible(true);
    showToast(
      `Insufficient funds${rideName ? ` for ${rideName}` : ""}. Add NGN ${formattedAmount} to continue.`,
    );
  }, [
    params.depositAmount,
    params.redirectReason,
    params.rideName,
    redirectReason,
    toastOpacity,
  ]);

  const handleDepositAmountChange = (value: string) => {
    const digitsOnly = value.replace(/\D/g, "");

    if (!digitsOnly) {
      setDepositAmount("");
      return;
    }

    setDepositAmount(Number(digitsOnly).toLocaleString("en-NG"));
  };

  const openDepositModal = async () => {
    setBlockingLoader(null);
    setDepositModalVisible(true);
    setDepositInfoError(null);

    if (depositInfo) return;

    setLoadingDepositInfo(true);
    try {
      const accessToken = await getAccessTokenWithRetry(getAccessToken);
      if (!accessToken) throw new Error("Not authenticated");

      try {
        const info = await getWalletDepositInfo({ accessToken });
        setDepositInfo(info);
      } catch (fetchError: any) {
        // 404 means no VA yet — provision one
        if (fetchError?.status === 404 || fetchError?.message?.includes("404")) {
          const provisioned = await provisionVirtualAccount({ accessToken });
          setDepositInfo({
            accountNumber: provisioned.accountNumber,
            accountName: provisioned.accountName,
            bankName: provisioned.bankName,
            currency: provisioned.currency,
          });
        } else {
          throw fetchError;
        }
      }
    } catch (error) {
      setDepositInfoError(
        error instanceof Error ? error.message : "Could not load deposit info.",
      );
    } finally {
      setLoadingDepositInfo(false);
    }
  };

  const closeDepositModal = () => {
    setDepositModalVisible(false);
  };

  const handleWithdrawAmountChange = (value: string) => {
    withdrawalIdempotencyKeyRef.current = null;
    setVerifiedWithdrawAccount(null);
    const digitsOnly = value.replace(/\D/g, "");

    if (!digitsOnly) {
      setWithdrawAmount("");
      return;
    }

    setWithdrawAmount(Number(digitsOnly).toLocaleString("en-NG"));
  };

  const openWithdrawModal = () => {
    setWithdrawConfirmVisible(false);
    setBankPickerVisible(false);
    setBlockingLoader(null);
    setWithdrawModalVisible(true);
    void loadWithdrawalBankNetworks("");
  };

  const closeWithdrawModal = () => {
    if (isCreatingWithdrawal || isVerifyingBankAccount) {
      return;
    }

    setWithdrawModalVisible(false);
    setBankPickerVisible(false);
  };

  const closeWithdrawConfirmModal = () => {
    if (isCreatingWithdrawal) {
      return;
    }

    setWithdrawConfirmVisible(false);
  };

  const closeBankPickerModal = () => {
    setBankPickerVisible(false);
    setWithdrawModalVisible(true);
  };

  const resetWithdrawalFlow = () => {
    setWithdrawModalVisible(false);
    setWithdrawConfirmVisible(false);
    setBankPickerVisible(false);
    setWithdrawAmount("");
    setWithdrawAccountNumber("");
    setSelectedWithdrawBank(null);
    setVerifiedWithdrawAccount(null);
    setBankSearchQuery("");
  };

  const maybeContinueDeferredRide = () => {
    if (redirectReason !== "insufficient-funds") {
      return;
    }

    router.replace(
      itineraryParam
        ? {
            pathname: "/matching",
            params: {
              itinerary: itineraryParam,
            },
          }
        : "/matching",
    );
  };

  const handleWithdrawPress = () => {
    openWithdrawModal();
  };

  const availableWithdrawalBalanceNgn = overview?.balanceNgn ?? 0;

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
      showToast(
        error instanceof Error
          ? error.message
          : "Could not load the supported withdrawal banks.",
      );
    } finally {
      setLoadingBankNetworks(false);
    }
  };

  useEffect(() => {
    if (!isReady || !isBankPickerVisible) {
      return;
    }

    const timeout = setTimeout(() => {
      void loadWithdrawalBankNetworks(bankSearchQuery);
    }, 90);

    return () => clearTimeout(timeout);
  }, [
    bankSearchQuery,
    isBankPickerVisible,
    isReady,
  ]);

  useEffect(() => {
    if (!isReady || !isBackendConfigured() || hasPrefetchedBanksRef.current) {
      return;
    }

    hasPrefetchedBanksRef.current = true;
    void loadWithdrawalBankNetworks("");
  }, [isReady]);

  const handleYieldPress = () => {
    Alert.alert(
      "Earn yield",
      "Yield deposits will open from this button soon.",
    );
  };

  const handleCopyValue = async (label: string, value?: string | null) => {
    if (!value) {
      return;
    }

    await Clipboard.setStringAsync(value);
    setToastMessage(`${label} copied.`);
  };

  const handleWithdrawContinue = async () => {
    const amountNgn = parseNgnAmount(withdrawAmount);
    const bankAccountNumber = withdrawAccountNumber.replace(/\D/g, "");
    const bankNetworkId = selectedWithdrawBank?.id ?? "";

    if (!amountNgn) {
      Alert.alert(
        "Amount required",
        "Enter the amount you want to withdraw in Naira.",
      );
      return;
    }

    if (amountNgn > availableWithdrawalBalanceNgn) {
      Alert.alert(
        "Insufficient balance",
        `You have insufficient balance for this withdrawal. Available balance is NGN ${Math.round(
          availableWithdrawalBalanceNgn,
        ).toLocaleString("en-NG")}.`,
      );
      return;
    }

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
      showToast("Backend unavailable right now.");
      return;
    }

    if (!isReady) {
      showToast("Wait a moment for your account to finish loading.");
      return;
    }

    const accessToken = await getAccessTokenWithRetry(getAccessToken);
    if (!accessToken) {
      showToast("Could not verify your session right now.");
      return;
    }

    setWithdrawModalVisible(false);
    setBlockingLoader({
      title: "Checking account",
      message: "Verifying your bank details before payout.",
    });
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

      setVerifiedWithdrawAccount({
        accountNumber: response.bankAccount.accountNumber,
        accountName: response.bankAccount.accountName,
        bankName: response.bankAccount.bankName,
        networkId: response.bankAccount.networkId,
      });
      setWithdrawModalVisible(false);
      setWithdrawConfirmVisible(true);
    } catch (error) {
      setWithdrawModalVisible(true);
      Alert.alert(
        "Verification failed",
        error instanceof Error
          ? error.message
          : "Could not verify the bank account.",
      );
    } finally {
      setBlockingLoader(null);
      setVerifyingBankAccount(false);
    }
  };

  const handleConfirmWithdrawal = async () => {
    const amountNgn = parseNgnAmount(withdrawAmount);

    if (!amountNgn || !verifiedWithdrawAccount) {
      Alert.alert(
        "Withdrawal details missing",
        "Verify the bank account again before proceeding.",
      );
      return;
    }

    if (amountNgn > availableWithdrawalBalanceNgn) {
      Alert.alert(
        "Insufficient balance",
        `You have insufficient balance for this withdrawal. Available balance is NGN ${Math.round(
          availableWithdrawalBalanceNgn,
        ).toLocaleString("en-NG")}.`,
      );
      return;
    }

    if (!isBackendConfigured()) {
      showToast("Backend unavailable right now.");
      return;
    }

    if (!isReady) {
      showToast("Wait a moment for your account to finish loading.");
      return;
    }

    const accessToken = await getAccessTokenWithRetry(getAccessToken);
    if (!accessToken) {
      showToast("Could not verify your session right now.");
      return;
    }

    setWithdrawConfirmVisible(false);
    setBlockingLoader({
      title: "Sending withdrawal",
      message: "Submitting your withdrawal request now.",
    });
    setCreatingWithdrawal(true);

    try {
      const response = await createWalletWithdrawal({
        accessToken,
        idempotencyKey:
          withdrawalIdempotencyKeyRef.current ??
          (withdrawalIdempotencyKeyRef.current = createIdempotencyKey(
            "wallet-withdrawal",
          )),
        amountNgn,
        bankAccount: {
          accountNumber: verifiedWithdrawAccount.accountNumber,
          accountName: verifiedWithdrawAccount.accountName,
          networkId: verifiedWithdrawAccount.networkId,
        },
      });

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

      const outcome = created
        ? await waitForWithdrawalOutcome({ accessToken, withdrawalId: created.id })
        : null;

      if (outcome && FAILED_WITHDRAWAL_STATUSES.includes(outcome.status)) {
        await refreshWalletOverview();
        throw new Error(
          outcome.failureReason ??
            "The bank transfer did not go through. Your balance has been refunded.",
        );
      }

      await refreshWalletOverview();
      resetWithdrawalFlow();
      withdrawalIdempotencyKeyRef.current = null;

      const amountLabel = `NGN ${amountNgn.toLocaleString("en-NG")}`;
      showToast(
        outcome?.status === "SETTLED"
          ? `Withdrawal of ${amountLabel} sent to your bank.`
          : `Withdrawal of ${amountLabel} is processing — we'll update your wallet once the bank confirms.`,
      );
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

  const handleWalletPagePress = (pageId: string) => {
    if (pageId === "transactions") {
      router.push("/rider/transactions");
      return;
    }

    if (pageId === "pay-online") {
      setDepositModalVisible(true);
      return;
    }

    Alert.alert("Withdrawals pending", "Withdraw pages are not active yet.");
  };

  const displayCurrency = "NGN";
  const displayedWalletBalance = formatWalletCurrencyAmount(
    displayCurrency,
    overview?.balanceNgn ?? 0,
  );
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
  const selectedWithdrawBankLabel = selectedWithdrawBank
    ? selectedWithdrawBank.name
    : "Select bank";
  const displayedWithdrawAmount = parseNgnAmount(withdrawAmount);

  return (
    <>
      <AppScreen
        backgroundColor={theme.colors.offWhite}
        scroll
        contentStyle={styles.container}
      >
        <StatusBar style="dark" backgroundColor={theme.colors.offWhite} />
        <SectionHeader
          actionLabel="Rider home"
          onActionPress={() => router.replace("/rider")}
          title="Wallet"
          titleVariant="h1"
        />

        <WalletBalanceCard
          balance={displayedWalletBalance}
          onDeposit={openDepositModal}
          onWithdraw={handleWithdrawPress}
        />

        <Pressable onPress={handleYieldPress} style={styles.yieldCard}>
          <AppText variant="h3" color={theme.colors.offWhite}>
            Earn Yield
          </AppText>
        </Pressable>

        <SectionHeader
          // subtitle="Clean wallet pages instead of the old deposit form block."
          title="Wallet pages"
          titleVariant="h3"
        />
        <View style={styles.walletPagesList}>
          {walletPages.map((page) => (
            <Pressable
              key={page.id}
              onPress={() => handleWalletPagePress(page.id)}
              style={styles.pageCard}
            >
              <View style={styles.pageIconWrap}>
                <MaterialIcons
                  color={theme.colors.black}
                  name={page.icon}
                  size={18}
                />
              </View>
              <View style={styles.pageCopy}>
                <AppText variant="label">{page.title}</AppText>
                <AppText variant="bodySmall" color={theme.colors.muted}>
                  {page.subtitle}
                </AppText>
              </View>
              <MaterialIcons
                color={theme.colors.orange}
                name="arrow-forward"
                size={18}
              />
            </Pressable>
          ))}
        </View>
      </AppScreen>

      <Modal
        animationType="fade"
        onRequestClose={closeDepositModal}
        transparent
        visible={isDepositModalVisible}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <AppText variant="h3">Deposit in Naira</AppText>
                <AppText variant="bodySmall" color={theme.colors.muted}>
                  Transfer NGN to this account. Your balance updates automatically.
                </AppText>
              </View>
            </View>

            {isLoadingDepositInfo ? (
              <View style={styles.depositInfoLoading}>
                <ActivityIndicator color={theme.colors.orange} size="small" />
                <AppText variant="bodySmall" color={theme.colors.muted}>
                  Loading account details...
                </AppText>
              </View>
            ) : depositInfoError ? (
              <View style={styles.depositInfoError}>
                <AppText variant="bodySmall" color={theme.colors.orange}>
                  {depositInfoError}
                </AppText>
                <AppButton
                  onPress={() => { setDepositInfo(null); void openDepositModal(); }}
                  title="Retry"
                  variant="ghost"
                  style={{ marginTop: 8 }}
                />
              </View>
            ) : depositInfo ? (
              <View style={styles.depositInfoContainer}>
                <View style={styles.depositInfoRow}>
                  <AppText variant="bodySmall" color={theme.colors.muted}>Bank</AppText>
                  <AppText variant="mono">{depositInfo.bankName}</AppText>
                </View>
                <Pressable
                  style={styles.depositInfoRow}
                  onPress={() => handleCopyValue("Account number", depositInfo.accountNumber)}
                >
                  <AppText variant="bodySmall" color={theme.colors.muted}>Account Number</AppText>
                  <View style={styles.depositCopyRow}>
                    <AppText variant="monoLarge">{depositInfo.accountNumber}</AppText>
                    <MaterialIcons name="content-copy" size={16} color={theme.colors.orange} />
                  </View>
                </Pressable>
                <View style={styles.depositInfoRow}>
                  <AppText variant="bodySmall" color={theme.colors.muted}>Account Name</AppText>
                  <AppText variant="mono">{depositInfo.accountName}</AppText>
                </View>
              </View>
            ) : null}

            <View style={styles.modalButtonRow}>
              <View style={{ flex: 1 }}>
                <AppButton
                  onPress={closeDepositModal}
                  title="Done"
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={blockingLoader != null}
      >
        <View style={styles.loadingBackdrop}>
          <View style={styles.loadingCard}>
            <View style={styles.loadingSpinnerWrap}>
              <ActivityIndicator
                color={theme.colors.orange}
                size="large"
              />
            </View>
            <View style={styles.loadingCopy}>
              <AppText variant="h3">
                {blockingLoader?.title ?? "Loading"}
              </AppText>
              <AppText variant="bodySmall" color={theme.colors.muted}>
                {blockingLoader?.message ?? "Please wait a moment."}
              </AppText>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={closeWithdrawModal}
        transparent
        visible={isWithdrawModalVisible}
      >
        <KeyboardShiftView style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <AppText variant="h3">Withdraw in Naira</AppText>
                <AppText variant="bodySmall" color={theme.colors.muted}>
                  Enter your bank details and the amount you want paid out.
                </AppText>
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <AppText variant="bodySmall" color={theme.colors.muted}>
                Amount in NGN
              </AppText>
              <TextInput
                keyboardType="number-pad"
                onChangeText={handleWithdrawAmountChange}
                placeholder="0"
                placeholderTextColor="#B5ACA4"
                style={styles.input}
                value={withdrawAmount}
              />
            </View>

            <View style={styles.fieldGroup}>
              <AppText variant="bodySmall" color={theme.colors.muted}>
                Bank
              </AppText>
              <Pressable
                onPress={() => {
                  setWithdrawModalVisible(false);
                  setBankPickerVisible(true);
                  void loadWithdrawalBankNetworks(bankSearchQuery);
                }}
                style={styles.selectorInput}
              >
                <AppText
                  variant="bodyMedium"
                  color={
                    selectedWithdrawBank
                      ? theme.colors.black
                      : theme.colors.muted
                  }
                >
                  {selectedWithdrawBankLabel}
                </AppText>
                <MaterialIcons
                  color={theme.colors.black}
                  name="keyboard-arrow-down"
                  size={20}
                />
              </Pressable>
            </View>

            <View style={styles.fieldGroup}>
              <AppText variant="bodySmall" color={theme.colors.muted}>
                Account number
              </AppText>
              <TextInput
                keyboardType="number-pad"
                onChangeText={(value) => {
                  withdrawalIdempotencyKeyRef.current = null;
                  setVerifiedWithdrawAccount(null);
                  setWithdrawAccountNumber(value.replace(/\D/g, ""));
                }}
                placeholder="0123456789"
                placeholderTextColor="#B5ACA4"
                style={styles.input}
                value={withdrawAccountNumber}
              />
            </View>

            <View style={styles.modalButtonRow}>
              <View style={styles.modalButtonSlot}>
                <AppButton
                  onPress={closeWithdrawModal}
                  style={styles.cancelButton}
                  title="Cancel"
                  variant="ghost"
                />
              </View>
              <View style={styles.modalButtonSlot}>
                <AppButton
                  disabled={isVerifyingBankAccount}
                  onPress={handleWithdrawContinue}
                  title="Continue"
                />
              </View>
            </View>
          </View>
        </KeyboardShiftView>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={closeBankPickerModal}
        transparent
        visible={isBankPickerVisible}
      >
        <KeyboardShiftView style={styles.paymentWidgetBackdrop}>
          <View style={styles.bankPickerSheet}>
            <View style={styles.paymentWidgetHeader}>
              <View style={styles.pageCopy}>
                <AppText variant="h3">Choose bank</AppText>
                <AppText variant="bodySmall" color={theme.colors.muted}>
                  Choose from the list or search for your bank.
                </AppText>
              </View>
              <Pressable
                onPress={closeBankPickerModal}
                style={styles.closeButton}
              >
                <MaterialIcons
                  color={theme.colors.black}
                  name="close"
                  size={18}
                />
              </Pressable>
            </View>

            <TextInput
              autoCapitalize="words"
              onChangeText={setBankSearchQuery}
              placeholder="Search bank"
              placeholderTextColor="#B5ACA4"
              style={styles.input}
              value={bankSearchQuery}
            />

            <ScrollView
              contentContainerStyle={styles.bankResultsList}
              showsVerticalScrollIndicator={false}
            >
              {filteredWithdrawalBanks.map((bank) => (
                <Pressable
                  key={bank.id}
                  onPress={() => {
                    withdrawalIdempotencyKeyRef.current = null;
                    setSelectedWithdrawBank(bank);
                    setVerifiedWithdrawAccount(null);
                    setBankPickerVisible(false);
                    setWithdrawModalVisible(true);
                  }}
                  style={styles.bankResultCard}
                >
                  <View style={styles.pageCopy}>
                    <AppText variant="label">{bank.name}</AppText>
                    {bank.code ? (
                      <AppText variant="bodySmall" color={theme.colors.muted}>
                        {bank.code}
                      </AppText>
                    ) : null}
                  </View>
                  <MaterialIcons
                    color={theme.colors.orange}
                    name="north-east"
                    size={16}
                  />
                </Pressable>
              ))}
              {!filteredWithdrawalBanks.length && !isLoadingBankNetworks ? (
                <AppText variant="bodySmall" color={theme.colors.muted}>
                  No banks matched your search.
                </AppText>
              ) : null}
            </ScrollView>
          </View>
        </KeyboardShiftView>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={closeWithdrawConfirmModal}
        transparent
        visible={isWithdrawConfirmVisible}
      >
        <View style={styles.paymentWidgetBackdrop}>
          <View style={styles.paymentWidgetSheet}>
            <View style={styles.paymentWidgetHeader}>
              <View style={styles.pageCopy}>
                <AppText variant="h3">Confirm Withdrawal</AppText>
                <AppText variant="bodySmall" color={theme.colors.muted}>
                  Review the verified account details before you proceed.
                </AppText>
              </View>
              <Pressable
                onPress={closeWithdrawConfirmModal}
                style={styles.closeButton}
              >
                <MaterialIcons
                  color={theme.colors.black}
                  name="close"
                  size={18}
                />
              </Pressable>
            </View>

            <View style={styles.widgetHero}>
              <AppText variant="bodySmall" color={theme.colors.muted}>
                Withdrawal amount
              </AppText>
              <AppText variant="display">
                {displayedWithdrawAmount
                  ? `NGN ${displayedWithdrawAmount.toLocaleString("en-NG")}`
                  : "Pending"}
              </AppText>
            </View>

            <AppCard
              backgroundColor={theme.colors.white}
              style={styles.paymentDetailsCard}
            >
              <InstructionRow
                label="Bank Name"
                value={verifiedWithdrawAccount?.bankName ?? "Pending"}
              />
              <InstructionRow
                label="Account Number"
                value={verifiedWithdrawAccount?.accountNumber ?? "Pending"}
              />
              <InstructionRow
                label="Account Name"
                value={verifiedWithdrawAccount?.accountName ?? "Pending"}
              />
            </AppCard>

            <View style={styles.widgetButtonStack}>
              <AppButton
                disabled={isCreatingWithdrawal}
                onPress={handleConfirmWithdrawal}
                title="Proceed"
              />
              <AppButton
                onPress={() => {
                  setWithdrawConfirmVisible(false);
                  setWithdrawModalVisible(true);
                }}
                style={styles.cancelButton}
                title="Back"
                variant="ghost"
              />
            </View>
          </View>
        </View>
      </Modal>

      {toastMessage ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.toast,
            {
              top: insets.top + theme.spacing.sm,
              opacity: toastOpacity,
              transform: [
                {
                  translateY: toastOpacity.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-12, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <MaterialIcons
            color={theme.colors.offWhite}
            name="info-outline"
            size={18}
          />
          <AppText
            variant="bodySmall"
            color={theme.colors.offWhite}
            style={styles.toastText}
          >
            {toastMessage}
          </AppText>
        </Animated.View>
      ) : null}
    </>
  );
}

function InstructionRow(props: {
  label: string;
  value: string;
  actionLabel?: string;
  onActionPress?: () => void;
}) {
  return (
    <View style={styles.instructionRow}>
      <View style={styles.pageCopy}>
        <AppText variant="bodySmall" color={theme.colors.muted}>
          {props.label}
        </AppText>
        <AppText
          variant={
            props.label === "Account Number" ? "monoLarge" : "bodyMedium"
          }
        >
          {props.value}
        </AppText>
      </View>
      {props.actionLabel && props.onActionPress ? (
        <Pressable
          onPress={props.onActionPress}
          style={styles.inlineCopyButton}
        >
          <MaterialIcons
            color={theme.colors.black}
            name="content-copy"
            size={14}
          />
          <AppText variant="bodySmall">{props.actionLabel}</AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing.md,
    paddingTop: theme.spacing.lg,
  },
  yieldCard: {
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.orange,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.orange,
    padding: theme.spacing.sm,
    minHeight: 72,
    alignItems: "center",
    justifyContent: "center",
    ...theme.shadows.card,
  },
  walletPagesList: {
    gap: theme.spacing.sm,
  },
  pageCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.white,
    padding: theme.spacing.md,
    ...theme.shadows.card,
  },
  pageIconWrap: {
    width: 36,
    height: 36,
    borderRadius: theme.radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.orangeLight,
    borderWidth: theme.borders.regular,
    borderColor: "#F0B48D",
  },
  pageCopy: {
    flex: 1,
    gap: 2,
  },
  refreshChip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.xs,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.black,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.orangeLight,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  paymentWidgetBackdrop: {
    flex: 1,
    backgroundColor: "rgba(13,13,13,0.48)",
    justifyContent: "flex-end",
  },
  paymentWidgetSheet: {
    borderTopLeftRadius: theme.radii.lg,
    borderTopRightRadius: theme.radii.lg,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.offWhite,
    paddingHorizontal: theme.layout.screenPadding,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  bankPickerSheet: {
    maxHeight: "78%",
    borderTopLeftRadius: theme.radii.lg,
    borderTopRightRadius: theme.radii.lg,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.offWhite,
    paddingHorizontal: theme.layout.screenPadding,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  paymentWidgetHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: theme.spacing.md,
  },
  widgetHero: {
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.orange,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.orangeLight,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
    ...theme.shadows.card,
  },
  paymentDetailsCard: {
    gap: theme.spacing.sm,
  },
  bankLoadingState: {
    minHeight: 160,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.sm,
  },
  bankInlineLoadingState: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  bankResultsList: {
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
  },
  bankResultCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.black,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.white,
    padding: theme.spacing.md,
  },
  instructionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "#EEE0D4",
  },
  inlineCopyButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.black,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.white,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  widgetButtonStack: {
    gap: theme.spacing.sm,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(13,13,13,0.44)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.layout.screenPadding,
  },
  loadingBackdrop: {
    flex: 1,
    backgroundColor: "rgba(13,13,13,0.44)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.layout.screenPadding,
  },
  loadingCard: {
    width: "100%",
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.offWhite,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.xl,
    alignItems: "center",
    gap: theme.spacing.md,
    ...theme.shadows.card,
  },
  loadingSpinnerWrap: {
    width: 72,
    height: 72,
    borderRadius: theme.radii.pill,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingCopy: {
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  modalCard: {
    width: "100%",
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.offWhite,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    ...theme.shadows.card,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: theme.spacing.md,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: theme.radii.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.white,
  },
  fieldGroup: {
    gap: theme.spacing.xs,
  },
  depositInfoLoading: {
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.lg,
  },
  depositInfoError: {
    alignItems: "center",
    paddingVertical: theme.spacing.md,
  },
  depositInfoContainer: {
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  depositInfoRow: {
    gap: 4,
  },
  depositCopyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  selectorInput: {
    minHeight: 50,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.white,
    paddingHorizontal: theme.spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.sm,
  },
  input: {
    minHeight: 50,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.white,
    paddingHorizontal: theme.spacing.md,
    fontFamily: theme.fonts.body,
    fontSize: 14,
    color: theme.colors.black,
  },
  modalButtonRow: {
    flexDirection: "row",
    gap: theme.spacing.sm,
  },
  modalButtonSlot: {
    flex: 1,
  },
  cancelButton: {
    backgroundColor: theme.colors.white,
    shadowOpacity: 0,
    elevation: 0,
  },
  toast: {
    position: "absolute",
    left: theme.layout.screenPadding,
    right: theme.layout.screenPadding,
    zIndex: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.black,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    ...theme.shadows.card,
  },
  toastText: {
    flex: 1,
  },
});
