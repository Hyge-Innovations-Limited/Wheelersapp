import { StyleSheet, Text, View } from "react-native";

import { RIconDot, RRow, rider } from "@/components/rider/kit";
import {
  transactionIcon,
  transactionSignedAmount,
  transactionTitle,
  transactionWhen,
} from "@/components/rider/wallet-format";
import type { WalletTransaction } from "@/lib/api";

/** One wallet movement: what it was, when, and the signed amount (money in is green). */
export function TransactionRow({ transaction, last }: { transaction: WalletTransaction; last?: boolean }) {
  const credit = transaction.direction === "CREDIT";
  const title = transactionTitle(transaction);
  const when = transactionWhen(transaction.createdAt);
  const amount = transactionSignedAmount(transaction);

  return (
    <View accessible accessibilityLabel={`${title}, ${amount}${when ? `, ${when}` : ""}`}>
      <RRow
        last={last}
        left={<RIconDot name={transactionIcon(transaction)} tone={credit ? "green" : "tint"} />}
        right={
          <Text maxFontSizeMultiplier={1.2} style={[styles.amount, credit ? styles.credit : null]}>
            {amount}
          </Text>
        }
        subtitle={when || null}
        title={title}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  amount: {
    fontFamily: rider.fonts.bold,
    fontSize: 17,
    color: rider.colors.ink,
    fontVariant: ["tabular-nums"],
  },
  credit: { color: rider.colors.green },
});
