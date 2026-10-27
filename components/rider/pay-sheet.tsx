import * as Clipboard from "expo-clipboard";
import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useDepositAccount } from "@/components/rider/deposit-account";
import { RButton, RCard, RLink, RText, naira, rider } from "@/components/rider/kit";
import { groupAccountNumber } from "@/components/rider/wallet-format";
import type { PaySheetStep } from "@/lib/ride-pay";

const { colors, fonts } = rider;

/**
 * Accepting a driver's offer: "Pay ₦X from your wallet?", or, when the wallet
 * is short, "Add ₦Y" with the rider's own account number. The accept goes by
 * itself once the money lands (the screen behind watches the balance).
 */
export function PaySheet({
  step,
  busy,
  onPay,
  onBack,
  onOpenAddMoney,
}: {
  /** Null hides the sheet. */
  step: PaySheetStep | null;
  busy?: boolean;
  onPay: () => void;
  onBack: () => void;
  /** The account number cannot be shown here: the full Add money screen. */
  onOpenAddMoney: (shortNgn: number) => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal animationType="slide" onRequestClose={onBack} transparent visible={step !== null}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          {step?.kind === "pay" ? (
            <>
              <View style={styles.copy}>
                <RText accessibilityRole="header" variant="heading">
                  {`Pay ${naira(step.fareNgn)} from your wallet?`}
                </RText>
                <RText color={colors.muted} variant="small">
                  Held now, paid at the end. Refunded if cancelled.
                </RText>
              </View>
              <RButton loading={busy} onPress={onPay} title={`Pay ${naira(step.fareNgn)}`} />
              <RLink onPress={onBack} title="Back" />
            </>
          ) : step?.kind === "add" ? (
            <AddMoney step={step} onBack={onBack} onOpenAddMoney={onOpenAddMoney} />
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function AddMoney({
  step,
  onBack,
  onOpenAddMoney,
}: {
  step: Extract<PaySheetStep, { kind: "add" }>;
  onBack: () => void;
  onOpenAddMoney: (shortNgn: number) => void;
}) {
  const deposit = useDepositAccount({ provision: true });
  const account = deposit.status === "ready" ? deposit.account : null;
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeout = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timeout);
  }, [copied]);

  return (
    <>
      <View style={styles.copy}>
        <RText accessibilityRole="header" variant="heading">
          {`Add ${naira(step.shortNgn)}`}
        </RText>
        <RText color={colors.muted} variant="small" style={styles.tabular}>
          {`To pay ${naira(step.fareNgn)}`}
        </RText>
      </View>

      <RCard tone="ink" style={styles.account}>
        {account ? (
          <>
            <View style={styles.accountCopy}>
              <RText color={colors.onInkMuted} variant="small">
                {account.bankName}
              </RText>
              <Text
                adjustsFontSizeToFit
                maxFontSizeMultiplier={1.1}
                numberOfLines={1}
                selectable
                style={styles.accountNumber}>
                {groupAccountNumber(account.accountNumber)}
              </Text>
              <RText color={colors.onInkSoft} variant="small" numberOfLines={1}>
                {account.accountName}
              </RText>
            </View>
            <RButton
              accessibilityLabel={copied ? "Account number copied" : "Copy account number"}
              accessibilityLiveRegion="polite"
              onPress={() => {
                void Clipboard.setStringAsync(account.accountNumber).then(() => setCopied(true));
              }}
              size="md"
              title={copied ? "Copied" : "Copy"}
            />
          </>
        ) : deposit.status === "loading" || deposit.status === "pending" ? (
          <ActivityIndicator accessibilityLabel="Getting your account number" color={colors.orange} />
        ) : (
          <View style={styles.accountCopy}>
            {"message" in deposit ? (
              <RText color={colors.onInkSoft} variant="small">
                {deposit.message}
              </RText>
            ) : null}
            <RButton
              onPress={() => onOpenAddMoney(step.shortNgn)}
              size="md"
              title="Add money"
              variant="onInk"
            />
          </View>
        )}
      </RCard>

      {account ? (
        <View accessibilityLiveRegion="polite" style={styles.waiting}>
          <ActivityIndicator color={colors.orange} size="small" />
          <RText color={colors.muted} variant="small">
            Books when the money lands
          </RText>
        </View>
      ) : null}
      <RLink onPress={onBack} title="Back" />
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(13,13,13,0.5)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.cream,
    borderTopLeftRadius: rider.radius.sheet,
    borderTopRightRadius: rider.radius.sheet,
    paddingHorizontal: rider.gutter,
    paddingTop: 20,
    gap: 12,
  },
  copy: { gap: 4 },
  tabular: { fontVariant: ["tabular-nums"] },
  account: { gap: 12, paddingVertical: 14, paddingHorizontal: 16 },
  accountCopy: { gap: 2 },
  accountNumber: {
    fontFamily: fonts.display,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: 1,
    color: colors.orange,
    fontVariant: ["tabular-nums"],
  },
  waiting: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
});
