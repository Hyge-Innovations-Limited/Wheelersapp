import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, RefreshControl, StyleSheet, View } from "react-native";

import { RBack, RScreen, RText, rider } from "@/components/rider/kit";
import { TransactionRow } from "@/components/rider/transaction-row";
import { useWalletTransactions } from "@/lib/wallet-transactions";

export default function RiderTransactionsScreen() {
  const { items, isLoading, error, refresh } = useWalletTransactions(40);
  const refreshing = isLoading && items.length > 0;
  const displayError = error && !/no wallet found/i.test(error) ? error : null;

  return (
    <RScreen
      bounces
      contentStyle={styles.container}
      refreshControl={
        <RefreshControl
          colors={[rider.colors.orange]}
          onRefresh={() => void refresh()}
          refreshing={refreshing}
          tintColor={rider.colors.orange}
        />
      }
      scroll>
      <StatusBar backgroundColor={rider.colors.cream} style="dark" />

      <View style={styles.header}>
        <RBack href="/rider/wallet" />
        <RText accessibilityRole="header" style={styles.headerTitle} variant="title">
          Transactions
        </RText>
      </View>
      <RText color={rider.colors.muted}>Money added, rides paid for, refunds and withdrawals.</RText>

      <View style={styles.list}>
        {isLoading && items.length === 0 ? (
          <View accessibilityLabel="Loading transactions" style={styles.state}>
            <ActivityIndicator color={rider.colors.orange} />
          </View>
        ) : null}

        {displayError ? (
          <RText accessibilityLiveRegion="polite" color={rider.colors.danger} variant="small">
            {displayError}
          </RText>
        ) : null}

        {!isLoading && !displayError && items.length === 0 ? (
          <View style={styles.state}>
            <RText style={styles.centered} variant="bodyBold">
              No transactions yet
            </RText>
            <RText color={rider.colors.muted} style={styles.centered} variant="small">
              Money you add and rides you pay for show here.
            </RText>
          </View>
        ) : null}

        {items.map((transaction, index) => (
          <TransactionRow
            key={transaction.id}
            last={index === items.length - 1}
            transaction={transaction}
          />
        ))}
      </View>
    </RScreen>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12, paddingTop: 12, paddingBottom: 32 },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  headerTitle: { flex: 1, fontSize: 26 },
  list: { minHeight: 240 },
  state: { alignItems: "center", gap: 4, paddingVertical: 40 },
  centered: { textAlign: "center" },
});
