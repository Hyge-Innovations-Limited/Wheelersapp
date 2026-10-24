import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useAuth } from "@/lib/auth";
import * as Clipboard from "expo-clipboard";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, RefreshControl, Share, StyleSheet, View } from "react-native";

import { AppButton } from "@/components/app-button";
import { AppCard } from "@/components/app-card";
import { AppInput } from "@/components/app-input";
import { AppScreen } from "@/components/app-screen";
import { AppText, OnLight } from "@/components/app-text";
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
import { friendHasRidden, joinedCount, joinedOn, useReferralFriends } from "@/lib/referral-friends";
import QRCodeStyled from "react-native-qrcode-styled";

import { theme } from "@/theme";
import { toUserMessage } from "@/lib/error-messages";

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
  const friends = useReferralFriends();

  // Loaded on open, and again whenever the page is pulled down.
  const [refreshing, setRefreshing] = useState(false);
  const loadSummary = useCallback(async () => {
    if (!isBackendConfigured() || !isReady || !user) {
      setIsLoading(false);
      return;
    }
    setErrorMessage(null);
    try {
      const accessToken = await getAccessTokenWithRetry(getAccessToken);
      if (!accessToken) {
        throw new Error("Sign in again to load your referral code.");
      }
      setSummary(await getReferralSummary({ accessToken }));
    } catch (error) {
      setErrorMessage(toUserMessage(error, "Could not load your referral code."));
    } finally {
      setIsLoading(false);
    }
  }, [getAccessToken, isReady, user]);

  useEffect(() => {
    setIsLoading(true);
    void loadSummary();
  }, [loadSummary]);

  async function pullToRefresh() {
    setRefreshing(true);
    await Promise.all([loadSummary(), friends.refresh()]);
    setRefreshing(false);
  }

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
      setCodeError(toUserMessage(error, "That code could not be saved. Try another one."));
    } finally {
      setSavingCode(false);
    }
  }
  const shareLink = summary?.shareLink ?? "";
  const shareMessage = useMemo(
    () =>
      referralCode
        ? shareLink
          ? `Ride with Wheelers and name your own price. Get the app and use my code ${referralCode} when you sign up: ${shareLink}`
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
      bounces
      contentStyle={styles.container}
      refreshControl={
        <RefreshControl
          colors={[theme.colors.orange]}
          onRefresh={() => void pullToRefresh()}
          refreshing={refreshing}
          tintColor={theme.colors.orange}
          title="Updating"
        />
      }
      scroll
    >
      <StatusBar style="dark" backgroundColor={theme.colors.offWhite} />
      <DecorativeBackground motif="referral" />

      <View style={styles.headerRow}>
        <BackArrow />
        <View style={styles.headerCopy}>
          <AppText variant="screenTitle">Invite friends</AppText>
          <AppText variant="bodySmall" color={theme.colors.muted}>
            Share your code with drivers and riders, and see who joined.
          </AppText>
        </View>
      </View>

      <AppCard style={styles.heroCard}>
        <OnLight>
        <View style={styles.heroIcon}>
          <OnLight>
          <MaterialIcons
            color={theme.colors.black}
            name="card-giftcard"
            size={30}
          />
          </OnLight>
        </View>
        <View style={styles.heroCopy}>
          <AppText variant="monoSmall" color={theme.colors.orange}>
            YOUR CODE
          </AppText>
          <AppText variant="metric" style={styles.code}>
            {isLoading ? "LOADING" : referralCode || (creating ? "NOT SET" : "PULL TO RETRY")}
          </AppText>
          <AppText variant="bodySmall" color={theme.colors.muted}>
            {creating
              ? "Create your code below, then share it with drivers and riders."
              : "Drivers and riders enter this code when they sign up, or scan your QR code."}
          </AppText>
        </View>
        </OnLight>
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
            <OnLight>
            <QRCodeStyled
              color={theme.colors.black}
              data={shareLink}
              padding={12}
              pieceSize={5}
              style={styles.qr}
            />
            </OnLight>
          </View>
          <AppText variant="bodySmall" color={theme.colors.muted} style={styles.qrHint}>
            Let a driver or rider scan this with their phone camera. It opens the Wheelers
            app in their store; they enter your code when they sign up.
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
          <OnLight>
          <AppText variant="bodyMedium" color={theme.colors.danger}>
            {errorMessage}
          </AppText>
          </OnLight>
        </AppCard>
      ) : null}

      <View style={styles.statsGrid}>
        <StatCard
          icon="group-add"
          label="Joined"
          value={String(joinedCount(summary))}
        />
        <StatCard
          icon="directions-car"
          label="Have ridden"
          value={String(summary?.qualifiedReferrals ?? 0)}
        />
      </View>
      {/* Cashback given before referrals stopped paying stays to spend: shown only while there is some. */}
      {summary && summary.availableCashbackNgn > 0 ? (
        <AppText variant="bodySmall" color={theme.colors.muted}>
          You have {formatNgn(summary.availableCashbackNgn)} ride cashback from earlier referrals to use.
        </AppText>
      ) : null}

      {friends.data && friends.data.items.length > 0 ? (
        <AppCard style={styles.friends}>
          <AppText variant="monoSmall" color={theme.colors.orange}>
            PEOPLE YOU INVITED
          </AppText>
          {friends.data.items.map((friend) => (
            <View key={friend.id} style={styles.friendRow}>
              <OnLight>
              <MaterialIcons
                color={friendHasRidden(friend) ? theme.colors.green : theme.colors.muted}
                name={friendHasRidden(friend) ? "check-circle" : "schedule"}
                size={20}
              />
              </OnLight>
              <AppText variant="bodyMedium" numberOfLines={1} style={styles.friendName}>
                {friend.referredUser}
              </AppText>
              <AppText variant="bodySmall" color={theme.colors.muted}>
                {friendHasRidden(friend) ? "Has ridden" : "Yet to ride"} · {joinedOn(friend)}
              </AppText>
            </View>
          ))}
        </AppCard>
      ) : null}


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
        <OnLight>
        <MaterialIcons color={theme.colors.black} name={icon} size={18} />
        </OnLight>
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
  friends: { gap: theme.spacing.sm },
  friendRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
  friendName: { flex: 1 },
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
