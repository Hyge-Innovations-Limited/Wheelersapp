import { HIDDEN_BALANCE, useBalanceHidden } from "@/lib/balance-hidden";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";

import { useDepositAccount } from "@/components/rider/deposit-account";
import { RButton, RCard, RLink, RScreen, RText, rider } from "@/components/rider/kit";
import { TransactionRow } from "@/components/rider/transaction-row";
import { groupAccountNumber, money } from "@/components/rider/wallet-format";
import { useWalletOverview } from "@/lib/wallet-overview";
import { useWalletTransactions } from "@/lib/wallet-transactions";

const RECENT_COUNT = 4;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function WalletScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    depositAmount?: string | string[];
    redirectReason?: string | string[];
    rideName?: string | string[];
    itinerary?: string | string[];
  }>();
  const { overview, error: overviewError, refresh: refreshWalletOverview } = useWalletOverview();
  const { hidden: balanceHidden, toggle: toggleBalanceHidden } = useBalanceHidden();
  const transactions = useWalletTransactions(RECENT_COUNT);
  const deposit = useDepositAccount({ provision: false });
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  const handledRedirectRef = useRef<string | null>(null);
  const firstFocusRef = useRef(true);

  const redirectReason = firstParam(params.redirectReason);
  const rawDepositAmount = firstParam(params.depositAmount);
  const rideName = firstParam(params.rideName);
  const itineraryParam = firstParam(params.itinerary);

  /** What the add-money screen needs to know when a ride sent the rider here. */
  const openAddMoney = useCallback(() => {
    const forwarded: Record<string, string> = {};
    if (rawDepositAmount) forwarded.depositAmount = rawDepositAmount;
    if (redirectReason) forwarded.redirectReason = redirectReason;
    if (rideName) forwarded.rideName = rideName;
    if (itineraryParam) forwarded.itinerary = itineraryParam;
    router.push({ pathname: "/rider-add-money", params: forwarded });
  }, [itineraryParam, rawDepositAmount, redirectReason, rideName, router]);

  // A ride that could not be paid for sends the rider here with the shortfall:
  // go straight to adding money, once per shortfall.
  useEffect(() => {
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

    handledRedirectRef.current = rawDepositAmount;
    openAddMoney();
  }, [openAddMoney, rawDepositAmount, redirectReason]);

  const refreshTransactions = transactions.refresh;
  const reloadDeposit = deposit.reload;

  // Coming back from adding money or a withdrawal: the list is fetched again.
  useFocusEffect(
    useCallback(() => {
      if (firstFocusRef.current) {
        firstFocusRef.current = false;
        return;
      }
      void refreshTransactions();
    }, [refreshTransactions]),
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refreshWalletOverview(), refreshTransactions(), reloadDeposit()]);
    } finally {
      setRefreshing(false);
    }
  }, [refreshTransactions, refreshWalletOverview, reloadDeposit]);

  const account = deposit.status === "ready" ? deposit.account : null;

  useEffect(() => {
    if (!copied) return;
    const timeout = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timeout);
  }, [copied]);

  const handleCopy = async () => {
    if (!account) return;
    await Clipboard.setStringAsync(account.accountNumber);
    setCopied(true);
  };

  const lockedNgn = overview?.lockedNgn ?? 0;
  const recent = transactions.items.slice(0, RECENT_COUNT);
  const transactionsError =
    transactions.error && !/no wallet found/i.test(transactions.error) ? transactions.error : null;

  return (
    <RScreen
      bounces
      contentStyle={styles.container}
      refreshControl={
        <RefreshControl
          colors={[rider.colors.orange]}
          onRefresh={() => void handleRefresh()}
          refreshing={refreshing}
          tintColor={rider.colors.orange}
        />
      }
      // The tab bar already keeps clear of the bottom inset.
      safeAreaEdges={["top", "left", "right"]}
      scroll>
      <StatusBar backgroundColor={rider.colors.cream} style="dark" />

      <RText accessibilityRole="header" variant="title">
        Wallet
      </RText>

      <RCard style={styles.balanceCard} tone="ink">
        <View style={styles.balanceCopy}>
          <View style={styles.balanceHead}>
            <RText color={rider.colors.onInkMuted} variant="small">
              Balance
            </RText>
            <Pressable
              accessibilityLabel={balanceHidden ? "Show balance" : "Hide balance"}
              accessibilityRole="button"
              hitSlop={12}
              onPress={toggleBalanceHidden}
              style={({ pressed }) => [styles.eye, pressed ? styles.pressed : null]}>
              <Ionicons color={rider.colors.onInkMuted} name={balanceHidden ? "eye-off-outline" : "eye-outline"} size={22} />
            </Pressable>
          </View>
          <Text
            adjustsFontSizeToFit
            maxFontSizeMultiplier={1.1}
            numberOfLines={1}
            style={styles.balanceFigure}>
            {balanceHidden ? HIDDEN_BALANCE : overview ? money(overview.balanceNgn) : "₦—"}
          </Text>
          {lockedNgn > 0 && !balanceHidden ? (
            <RText color={rider.colors.onInkMuted} variant="small">
              {`${money(lockedNgn)} on hold`}
            </RText>
          ) : null}
          {!overview && overviewError ? (
            <RText color={rider.colors.onInkMuted} variant="small">
              Could not load your balance. Pull down to try again.
            </RText>
          ) : null}
        </View>
        <View style={styles.balanceActions}>
          <RButton
            accessibilityLabel="Add money"
            onPress={openAddMoney}
            size="md"
            style={styles.balanceAction}
            title="Add money"
          />
          <RButton
            accessibilityLabel="Withdraw"
            onPress={() => router.push("/rider-withdraw")}
            size="md"
            style={styles.balanceAction}
            title="Withdraw"
            variant="onInk"
          />
        </View>
      </RCard>

      {account ? (
        <RCard style={styles.accountCard} tone="outline">
          <View style={styles.accountIntro}>
            <RText variant="bodyBold">Your Wheelers account number</RText>
            <RText color={rider.colors.muted} variant="small">
              Transfer to this account from any bank app to fund your wallet.
            </RText>
          </View>
          <View style={styles.accountRow}>
            <View style={styles.accountCopy}>
              <Text
                adjustsFontSizeToFit
                maxFontSizeMultiplier={1.1}
                numberOfLines={1}
                selectable
                style={styles.accountNumber}>
                {groupAccountNumber(account.accountNumber)}
              </Text>
              <RText color={rider.colors.muted} numberOfLines={2} variant="small">
                {`${account.bankName} · ${account.accountName}`}
              </RText>
            </View>
            <Pressable
              accessibilityLabel={copied ? "Account number copied" : "Copy account number"}
              accessibilityLiveRegion="polite"
              accessibilityRole="button"
              onPress={() => void handleCopy()}
              style={({ pressed }) => [styles.copyButton, pressed ? styles.pressed : null]}>
              <Ionicons
                color={rider.colors.card}
                name={copied ? "checkmark" : "copy-outline"}
                size={16}
              />
              <Text maxFontSizeMultiplier={1.15} style={styles.copyText}>
                {copied ? "Copied" : "Copy"}
              </Text>
            </Pressable>
          </View>
        </RCard>
      ) : null}

      <View>
        <View style={styles.sectionHeader}>
          <RText variant="label">RECENT TRANSACTIONS</RText>
          <RLink
            accessibilityLabel="See all transactions"
            color={rider.colors.orangeText}
            onPress={() => router.push("/rider/transactions")}
            title="See all"
          />
        </View>

        {recent.map((transaction, index) => (
          <TransactionRow
            key={transaction.id}
            last={index === recent.length - 1}
            transaction={transaction}
          />
        ))}

        {recent.length === 0 ? (
          <RText color={rider.colors.muted} style={styles.empty} variant="small">
            {transactions.isLoading
              ? "Loading your transactions."
              : (transactionsError ?? "No transactions yet. Money you add and rides you pay for show here.")}
          </RText>
        ) : null}
      </View>
    </RScreen>
  );
}

const styles = StyleSheet.create({
  balanceHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  eye: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  container: { gap: 16, paddingTop: 12, paddingBottom: 24 },
  pressed: { opacity: 0.72 },

  balanceCard: { padding: 20, borderRadius: 24, gap: 16 },
  balanceCopy: { gap: 2 },
  balanceFigure: {
    fontFamily: rider.fonts.display,
    fontSize: 52,
    lineHeight: 56,
    letterSpacing: -1.5,
    color: rider.colors.orange,
    fontVariant: ["tabular-nums"],
  },
  balanceActions: { flexDirection: "row", gap: 10 },
  balanceAction: { flex: 1 },

  accountCard: { gap: 10 },
  accountIntro: { gap: 2 },
  accountRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  accountCopy: { flex: 1, minWidth: 0 },
  accountNumber: {
    fontFamily: rider.fonts.display,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: 1,
    color: rider.colors.ink,
    fontVariant: ["tabular-nums"],
  },
  copyButton: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: rider.colors.ink,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  copyText: { fontFamily: rider.fonts.bold, fontSize: 15, color: rider.colors.card },

  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  empty: { paddingVertical: 12 },
});
