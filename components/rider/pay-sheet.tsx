import * as Clipboard from "expo-clipboard";
import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useDepositAccount } from "@/components/rider/deposit-account";
import { RButton, RCard, RLink, RText, naira, rider } from "@/components/rider/kit";
import { groupAccountNumber } from "@/components/rider/wallet-format";
import { getAccessTokenWithRetry } from "@/lib/access-token";
import { getWalletDepositPreview } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { addAmountNgn, type PaySheetStep } from "@/lib/ride-pay";

const { colors, fonts } = rider;

/**
 * Accepting a driver's offer: "Pay ₦X from your wallet?", or, when the wallet
 * is short, "Add ₦Y" with the rider's own account number. The accept goes by
 * itself once the money lands (the screen behind watches the balance).
 */
export function PaySheet({
  step,
  autoBook = true,
  busy,
  onPay,
  onBack,
  onOpenAddMoney,
  addSubtitle,
  waitingNote,
}: {
  /** Null hides the sheet. */
  step: PaySheetStep | null;
  /** The booking goes by itself when the money lands (not after the driver changed the price). */
  autoBook?: boolean;
  busy?: boolean;
  onPay: () => void;
  onBack: () => void;
  /** The account number cannot be shown here: the full Add money screen. */
  onOpenAddMoney: (shortNgn: number) => void;
  /** Replaces "To pay ₦X" under "Add ₦Y" (e.g. a route change). */
  addSubtitle?: string;
  /** Replaces "Books when the money lands". */
  waitingNote?: string;
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
            <AddMoney addSubtitle={addSubtitle} autoBook={autoBook} step={step} waitingNote={waitingNote} onBack={onBack} onOpenAddMoney={onOpenAddMoney} />
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

/**
 * What to send for this shortfall, deposit charges included. The server
 * works it out; until it answers (or on an older server) the shortfall.
 */
function useSendAmount(step: Extract<PaySheetStep, { kind: "add" }>): number {
  const { getAccessToken } = useAuth();
  const [previewNgn, setPreviewNgn] = useState<number | null>(null);
  const { shortNgn, feeIncluded } = step;

  useEffect(() => {
    setPreviewNgn(null);
    if (feeIncluded || !(shortNgn > 0)) return;
    let live = true;
    void (async () => {
      try {
        const accessToken = await getAccessTokenWithRetry(getAccessToken);
        if (!accessToken) return;
        const preview = await getWalletDepositPreview({ accessToken, amountNgn: shortNgn });
        if (live) setPreviewNgn(preview.sendNgn);
      } catch {
        // An older server, or no answer: the shortfall stands.
      }
    })();
    return () => {
      live = false;
    };
  }, [feeIncluded, getAccessToken, shortNgn]);

  return feeIncluded ? shortNgn : addAmountNgn(shortNgn, previewNgn);
}

function AddMoney({
  step,
  autoBook,
  onBack,
  onOpenAddMoney,
  addSubtitle,
  waitingNote,
}: {
  step: Extract<PaySheetStep, { kind: "add" }>;
  autoBook: boolean;
  addSubtitle?: string;
  waitingNote?: string;
  onBack: () => void;
  onOpenAddMoney: (shortNgn: number) => void;
}) {
  const deposit = useDepositAccount({ provision: true });
  const account = deposit.status === "ready" ? deposit.account : null;
  const [copied, setCopied] = useState(false);
  const sendNgn = useSendAmount(step);

  useEffect(() => {
    if (!copied) return;
    const timeout = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timeout);
  }, [copied]);

  return (
    <>
      <View style={styles.copy}>
        <RText accessibilityRole="header" variant="heading">
          {`Add ${naira(sendNgn)}`}
        </RText>
        <RText color={colors.muted} variant="small" style={styles.tabular}>
          {addSubtitle ?? `To pay ${naira(step.fareNgn)}`}
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
              onPress={() => onOpenAddMoney(sendNgn)}
              size="md"
              title="Add money"
              variant="onInk"
            />
          </View>
        )}
      </RCard>

      {account && autoBook ? (
        <View accessibilityLiveRegion="polite" style={styles.waiting}>
          <ActivityIndicator color={colors.orange} size="small" />
          <RText color={colors.muted} variant="small">
            {waitingNote ?? "Books when the money lands"}
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
