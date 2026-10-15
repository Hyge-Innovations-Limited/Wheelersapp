import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useAuth } from "@/lib/auth";
import * as Clipboard from "expo-clipboard";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import { Alert, Share, StyleSheet, View } from "react-native";

import { AppButton } from "@/components/app-button";
import { AppCard } from "@/components/app-card";
import { AppInput } from "@/components/app-input";
import { AppScreen } from "@/components/app-screen";
import { AppText } from "@/components/app-text";
import { BackArrow } from "@/components/back-arrow";
import { DecorativeBackground } from "@/components/DecorativeBackground";
import { getAccessTokenWithRetry } from "@/lib/access-token";
import {
  getReferralSummary,
  isBackendConfigured,
  setReferralCode,
  type ReferralSummaryResponse,
} from "@/lib/api";
import { REFERRAL_CODE_MIN, tidyReferralCode } from "@/lib/referral-entry";
import QRCodeStyled from "react-native-qrcode-styled";

import { theme } from "@/theme";

function formatNgn(value: number | null | undefined): string {
  const amount = Number.isFinite(value) ? Number(value) : 0;
  return `NGN ${Math.round(amount).toLocaleString("en-NG")}`;
}

export default function ReferralScreen() {
  const { getAccessToken, isReady, user } = useAuth();
  const [summary, setSummary] = useState<ReferralSummaryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSummary() {
      if (!isBackendConfigured() || !isReady || !user) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setErrorMessage(null);

      try {
        const accessToken = await getAccessTokenWithRetry(getAccessToken);
        if (!accessToken) {
          throw new Error("Sign in again to load your referral code.");
        }

        const nextSummary = await getReferralSummary({ accessToken });
        if (!cancelled) {
          setSummary(nextSummary);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Could not load your referral code.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadSummary();

    return () => {
      cancelled = true;
    };
  }, [getAccessToken, isReady, user]);

  // Nobody is handed a code: each person creates their own, once. It is theirs
  // for good: links and QR codes already shared keep working.
  const [wanted, setWanted] = useState("");
  const [savingCode, setSavingCode] = useState(false);
  const [codeError, setCodeError] = useState<string | undefined>(undefined);

  const referralCode = summary?.code ?? "";
  const creating = summary !== null && !referralCode;

  async function handleSaveCode() {
    const chosen = tidyReferralCode(wanted);
    if (chosen.length < REFERRAL_CODE_MIN || savingCode) return;
    setSavingCode(true);
    setCodeError(undefined);
    try {
      const accessToken = await getAccessTokenWithRetry(getAccessToken);
      if (!accessToken) throw new Error("Sign in again to save your referral code.");
      const saved = await setReferralCode({ accessToken, code: chosen });
      setSummary((current) => (current ? { ...current, ...saved } : current));
      setWanted("");
    } catch (error) {
      setCodeError(error instanceof Error ? error.message : "That code could not be saved. Try another one.");
    } finally {
      setSavingCode(false);
    }
  }
  const shareLink = summary?.shareLink ?? "";
  const shareMessage = useMemo(
    () =>
      referralCode
        ? shareLink
          ? `Ride with Wheelers and name your own price. Tap to start with my referral code ${referralCode}: ${shareLink}`
          : `Use my Wheelers referral code ${referralCode} after onboarding and book your rides on Wheelers.`
        : "Join me on Wheelers.",
    [referralCode, shareLink],
  );

  async function handleShare() {
    if (!referralCode) {
      Alert.alert("Referral code unavailable", "Try again in a moment.");
      return;
    }

    await Share.share({ message: shareMessage });
  }

  async function handleCopyLink() {
    if (!shareLink) return;
    await Clipboard.setStringAsync(shareLink);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 1600);
  }

  async function handleCopy() {
    if (!referralCode) {
      Alert.alert("Referral code unavailable", "Try again in a moment.");
      return;
    }

    await Clipboard.setStringAsync(referralCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <AppScreen
      backgroundColor={theme.colors.offWhite}
      contentStyle={styles.container}
      scroll
    >
      <StatusBar style="dark" backgroundColor={theme.colors.offWhite} />
      <DecorativeBackground motif="referral" />

      <View style={styles.headerRow}>
        <BackArrow />
        <View style={styles.headerCopy}>
          <AppText variant="screenTitle">Referral rewards</AppText>
          <AppText variant="bodySmall" color={theme.colors.muted}>
            Share your code with riders.
          </AppText>
        </View>
      </View>

      <AppCard style={styles.heroCard}>
        <View style={styles.heroIcon}>
          <MaterialIcons
            color={theme.colors.black}
            name="card-giftcard"
            size={30}
          />
        </View>
        <View style={styles.heroCopy}>
          <AppText variant="monoSmall" color={theme.colors.orange}>
            YOUR CODE
          </AppText>
          <AppText variant="metric" style={styles.code}>
            {isLoading ? "LOADING" : referralCode || (creating ? "NOT SET" : "UNAVAILABLE")}
          </AppText>
          <AppText variant="bodySmall" color={theme.colors.muted}>
            {creating
              ? "Create your code below, then share it with riders."
              : "Riders enter this code when they sign up, or scan your QR code."}
          </AppText>
        </View>
      </AppCard>

      {creating ? (
        <AppCard style={styles.codeForm}>
          <AppInput
            label="Create your referral code"
            hint="4 to 12 letters or numbers. Your name works well. It can't be changed later."
            placeholder="e.g. TUNDE"
            value={wanted}
            onChangeText={(text) => {
              setWanted(tidyReferralCode(text));
              setCodeError(undefined);
            }}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={12}
            returnKeyType="done"
            onSubmitEditing={() => void handleSaveCode()}
            error={codeError}
          />
          <AppButton
            disabled={wanted.length < REFERRAL_CODE_MIN}
            loading={savingCode}
            onPress={() => void handleSaveCode()}
            title="Create code"
          />
        </AppCard>
      ) : null}

      {shareLink ? (
        <AppCard style={styles.qrCard}>
          <AppText variant="monoSmall" color={theme.colors.orange}>
            YOUR QR CODE
          </AppText>
          <View
            accessibilityLabel={`QR code for your referral code ${referralCode}`}
            accessibilityRole="image"
            style={styles.qrFrame}
          >
            <QRCodeStyled
              color={theme.colors.black}
              data={shareLink}
              padding={12}
              pieceSize={5}
              style={styles.qr}
            />
          </View>
          <AppText variant="bodySmall" color={theme.colors.muted} style={styles.qrHint}>
            Let a rider scan this with their phone camera. It opens a chat with
            Wheelers with your code already filled in.
          </AppText>
          <AppText variant="bodySmall" numberOfLines={2} selectable style={styles.qrLink}>
            {shareLink}
          </AppText>
          <AppButton
            onPress={handleCopyLink}
            title={linkCopied ? "Link copied" : "Copy link"}
            variant="inverse"
          />
        </AppCard>
      ) : null}

      {errorMessage ? (
        <AppCard borderColor={theme.colors.danger} style={styles.noticeCard}>
          <AppText variant="bodyMedium" color={theme.colors.danger}>
            {errorMessage}
          </AppText>
        </AppCard>
      ) : null}

      <View style={styles.statsGrid}>
        <StatCard
          icon="account-balance-wallet"
          label="Available"
          value={formatNgn(summary?.availableCashbackNgn)}
        />
        <StatCard
          icon="ac-unit"
          label="Frozen"
          value={formatNgn(summary?.frozenCashbackNgn)}
        />
        <StatCard
          icon="directions-car"
          label="Ride referrals"
          value={String(summary?.qualifiedReferrals ?? 0)}
        />
        <StatCard
          icon="hourglass-empty"
          label="Pending"
          value={String(summary?.pendingReferrals ?? 0)}
        />
      </View>


      <View style={styles.actions}>
        <AppButton
          disabled={!referralCode}
          onPress={handleShare}
          style={styles.primaryAction}
          title={shareLink ? "Share link" : "Share code"}
        />
        <AppButton
          disabled={!referralCode}
          onPress={handleCopy}
          style={styles.secondaryAction}
          title={copied ? "Copied" : "Copy"}
          variant="inverse"
        />
      </View>
    </AppScreen>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <AppCard style={styles.statCard}>
      <View style={styles.statIcon}>
        <MaterialIcons color={theme.colors.black} name={icon} size={18} />
      </View>
      <AppText variant="monoSmall" color={theme.colors.muted}>
        {label}
      </AppText>
      <AppText variant="h3">{value}</AppText>
    </AppCard>
  );
}


const styles = StyleSheet.create({
  codeForm: { gap: theme.spacing.md },
  qrCard: { alignItems: "center", gap: theme.spacing.md },
  qrFrame: {
    borderRadius: theme.radii.md,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.white,
    overflow: "hidden",
  },
  qr: { backgroundColor: theme.colors.white },
  qrHint: { textAlign: "center" },
  qrLink: { textAlign: "center" },
  container: {
    gap: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.xxl,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing.md,
  },
  headerCopy: {
    flex: 1,
    gap: theme.spacing.xxs,
  },
  heroCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    backgroundColor: "#FFF4EA",
  },
  heroIcon: {
    width: 62,
    height: 62,
    borderRadius: theme.radius.pill,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.white,
    alignItems: "center",
    justifyContent: "center",
    ...theme.shadows.subtle,
  },
  heroCopy: {
    flex: 1,
    gap: 4,
  },
  code: {
    letterSpacing: 3,
  },
  noticeCard: {
    backgroundColor: theme.colors.dangerLight,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
  },
  statCard: {
    width: "48%",
    minHeight: 122,
    gap: 6,
  },
  statIcon: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.pill,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  actions: {
    flexDirection: "row",
    gap: theme.spacing.sm,
  },
  primaryAction: {
    flex: 2,
  },
  secondaryAction: {
    flex: 1,
  },
});
