import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Share, StyleSheet, Text, View } from "react-native";

import { useDepositAccount } from "@/components/rider/deposit-account";
import { RBack, RButton, RCard, RScreen, RText, rider } from "@/components/rider/kit";
import { groupAccountNumber, money } from "@/components/rider/wallet-format";
import { invalidateWalletCache, useWalletOverview } from "@/lib/wallet-overview";

const STEPS = [
  "Copy the account number.",
  "Transfer any amount from your bank app.",
  "We notify you when your wallet is credited.",
];

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Money comes in one way: a bank transfer to the rider's own account number. */
export default function RiderAddMoneyScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    depositAmount?: string | string[];
    redirectReason?: string | string[];
    rideName?: string | string[];
    itinerary?: string | string[];
  }>();
  const { overview, refresh: refreshWalletOverview } = useWalletOverview();
  const deposit = useDepositAccount({ provision: true });
  const [copied, setCopied] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const rideName = firstParam(params.rideName);
  const neededNgn = Number((firstParam(params.depositAmount) ?? "").replace(/\D/g, ""));
  const showNeeded = Number.isFinite(neededNgn) && neededNgn > 0;

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

  const handleShare = async () => {
    if (!account) return;
    try {
      await Share.share({
        message: `${account.bankName}\n${account.accountNumber}\n${account.accountName}`,
      });
    } catch {
      // The share sheet was dismissed or is unavailable: nothing to do.
    }
  };

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/rider/wallet");
  };

  // Back to where they came from. A ride that was waiting on this money is
  // not restarted from here: the transfer may not have landed yet, and the
  // ride's own screen is still open behind this one.
  const leave = goBack;

  const handleTransferMade = async () => {
    if (finishing) return;
    setFinishing(true);
    try {
      invalidateWalletCache();
      await refreshWalletOverview();
    } finally {
      setFinishing(false);
    }
    leave();
  };

  return (
    <RScreen contentStyle={styles.container} scroll>
      <StatusBar backgroundColor={rider.colors.cream} style="dark" />

      <View style={styles.header}>
        <RBack onPress={goBack} />
        <RText accessibilityRole="header" style={styles.headerTitle} variant="title">
          Add money
        </RText>
      </View>
      <RText color={rider.colors.muted}>
        Transfer to the account below. Your wallet is credited automatically.
      </RText>

      <RCard style={styles.accountCard} tone="ink">
        {account ? (
          <>
            <View style={styles.accountCopy}>
              <RText color={rider.colors.onInkMuted} variant="small">
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
              <RText color={rider.colors.onInkSoft} style={styles.accountName}>
                {account.accountName}
              </RText>
            </View>
            <View style={styles.accountActions}>
              <RButton
                accessibilityLabel={copied ? "Account number copied" : "Copy account number"}
                accessibilityLiveRegion="polite"
                onPress={() => void handleCopy()}
                size="md"
                style={styles.accountAction}
                title={copied ? "Copied" : "Copy"}
              />
              <RButton
                accessibilityLabel="Share account details"
                onPress={() => void handleShare()}
                size="md"
                style={styles.accountAction}
                title="Share details"
                variant="onInk"
              />
            </View>
          </>
        ) : deposit.status === "loading" ? (
          <View accessibilityLiveRegion="polite" style={styles.stateBox}>
            <ActivityIndicator color={rider.colors.orange} />
            <RText color={rider.colors.onInkSoft} variant="small">
              Getting your account number.
            </RText>
          </View>
        ) : deposit.status === "pending" ? (
          <View accessibilityLiveRegion="polite" style={styles.stateBox}>
            <ActivityIndicator color={rider.colors.orange} />
            <RText color={rider.colors.cream} variant="bodyBold">
              Your account number is on its way
            </RText>
            <RText color={rider.colors.onInkSoft} style={styles.stateText} variant="small">
              {deposit.message}
            </RText>
            <RButton
              accessibilityLabel="Check again for your account number"
              onPress={() => void deposit.reload()}
              size="md"
              style={styles.stateButton}
              title="Check again"
              variant="onInk"
            />
          </View>
        ) : deposit.status === "phone-required" ? (
          <View accessibilityLiveRegion="polite" style={styles.stateBox}>
            <RText color={rider.colors.cream} variant="bodyBold">
              Phone number needed
            </RText>
            <RText color={rider.colors.onInkSoft} style={styles.stateText} variant="small">
              {deposit.message}
            </RText>
            <RButton
              accessibilityLabel="Try again"
              onPress={() => void deposit.reload()}
              size="md"
              style={styles.stateButton}
              title="Try again"
              variant="onInk"
            />
          </View>
        ) : deposit.status === "error" ? (
          <View accessibilityLiveRegion="polite" style={styles.stateBox}>
            <RText color={rider.colors.cream} variant="bodyBold">
              Could not load your account number
            </RText>
            <RText color={rider.colors.onInkSoft} style={styles.stateText} variant="small">
              {deposit.message}
            </RText>
            <RButton
              accessibilityLabel="Try again"
              onPress={() => void deposit.reload()}
              size="md"
              style={styles.stateButton}
              title="Try again"
              variant="onInk"
            />
          </View>
        ) : null}
      </RCard>

      {account ? (
        <View style={styles.steps}>
          <RText variant="label">HOW IT WORKS</RText>
          {STEPS.map((step, index) => (
            <View key={step} style={styles.step}>
              <View style={styles.stepNumber}>
                <Text maxFontSizeMultiplier={1.1} style={styles.stepNumberText}>
                  {index + 1}
                </Text>
              </View>
              <RText style={styles.stepText}>{step}</RText>
            </View>
          ))}
        </View>
      ) : null}

      {showNeeded ? (
        <RCard style={styles.needed} tone="soft">
          <RText variant="bodyBold">{`Add at least ${money(neededNgn)} for your next ride`}</RText>
          {overview || rideName ? (
            <RText color={rider.colors.muted} variant="small">
              {[overview ? `Balance ${money(overview.balanceNgn)}.` : null, rideName ? `Ride: ${rideName}.` : null]
                .filter(Boolean)
                .join(" ")}
            </RText>
          ) : null}
        </RCard>
      ) : null}

      <View style={styles.spacer} />

      <RButton
        accessibilityLabel="I have made the transfer"
        disabled={!account}
        loading={finishing}
        onPress={() => void handleTransferMade()}
        title="I have made the transfer"
        variant="dark"
      />
      <Pressable
        accessibilityLabel="Not credited after 5 minutes? Contact support"
        accessibilityRole="link"
        onPress={() =>
          router.push({ pathname: "/support/chat", params: { topic: "Wallet not credited" } })
        }
        style={({ pressed }) => [styles.supportLine, pressed ? styles.pressed : null]}>
        <Text maxFontSizeMultiplier={1.2} style={styles.supportText}>
          Not credited after 5 minutes? <Text style={styles.supportLink}>Contact support</Text>.
        </Text>
      </Pressable>
    </RScreen>
  );
}

const styles = StyleSheet.create({
  container: { gap: 16, paddingTop: 12, paddingBottom: 16 },
  pressed: { opacity: 0.72 },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  headerTitle: { flex: 1, fontSize: 26 },

  accountCard: { padding: 20, borderRadius: 24, gap: 14 },
  accountCopy: { gap: 2 },
  accountNumber: {
    fontFamily: rider.fonts.display,
    fontSize: 38,
    lineHeight: 44,
    letterSpacing: 1.5,
    color: rider.colors.orange,
    fontVariant: ["tabular-nums"],
  },
  accountName: { fontSize: 15, lineHeight: 21 },
  accountActions: { flexDirection: "row", gap: 10 },
  accountAction: { flex: 1 },

  stateBox: { alignItems: "center", gap: 8, paddingVertical: 8 },
  stateText: { textAlign: "center" },
  stateButton: { alignSelf: "stretch", marginTop: 6 },

  steps: { gap: 12 },
  step: { flexDirection: "row", alignItems: "center", gap: 12 },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: rider.colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumberText: { fontFamily: rider.fonts.display, fontSize: 15, color: rider.colors.orange },
  stepText: { flex: 1 },

  needed: { paddingVertical: 14, borderRadius: rider.radius.lg, gap: 2 },

  spacer: { flexGrow: 1, minHeight: 8 },

  supportLine: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  supportText: {
    fontFamily: rider.fonts.regular,
    fontSize: 13,
    lineHeight: 19,
    color: rider.colors.muted,
    textAlign: "center",
  },
  supportLink: {
    fontFamily: rider.fonts.bold,
    color: rider.colors.orangeText,
    textDecorationLine: "underline",
  },
});
