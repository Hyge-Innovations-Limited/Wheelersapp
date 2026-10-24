import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { Alert, RefreshControl, Share, StyleSheet, Text, View } from "react-native";
import QRCodeStyled from "react-native-qrcode-styled";

import { RBack, RButton, RCard, RInput, RLink, RScreen, RText, naira, rider } from "@/components/rider/kit";
import { getAccessTokenWithRetry } from "@/lib/access-token";
import {
  applyReferralCode,
  getReferralSummary,
  isBackendConfigured,
  setReferralCode,
  type ReferralSummaryResponse,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useCachedQuery } from "@/lib/cached-query";
import { toUserMessage } from "@/lib/error-messages";
import { referralRefusal, tidyReferralCode } from "@/lib/referral-entry";
import { friendHasRidden, joinedCount, joinedOn, useReferralFriends } from "@/lib/referral-friends";

const { colors, fonts } = rider;
const tidyCode = tidyReferralCode;

/**
 * Invite friends: a box to add a code someone gave them (first, until one is
 * on the account: it is what most people open this screen for); the code the
 * rider creates for themselves, then its link and QR code to share; and the
 * people who joined with it. Nobody is paid for it, and nobody is handed a
 * code. Creating one asks
 * first, because it is theirs for good: a friend's code typed into the
 * wrong box would otherwise become their own.
 */
export default function RiderReferralScreen() {
  const { getAccessToken } = useAuth();
  const { data: summary, loading, error, refresh } = useCachedQuery<ReferralSummaryResponse>({
    key: "referral.summary",
    fetcher: (accessToken) => getReferralSummary({ accessToken }),
    staleMs: 60_000,
    enabled: isBackendConfigured(),
  });
  const friends = useReferralFriends();

  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  // Adding a code someone gave you.
  const [friendCode, setFriendCode] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);

  // Choosing your own code: once. It is theirs for good, so links already shared keep working.
  const [wanted, setWanted] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const code = summary?.code ?? "";
  const link = summary?.shareLink ?? "";
  const hasFriendCode = added || summary?.hasAppliedCode === true;
  // Loaded, and no code yet: they create one before there is anything to share.
  const creating = Boolean(summary) && !code;

  async function token(): Promise<string> {
    const accessToken = await getAccessTokenWithRetry(getAccessToken);
    if (!accessToken) throw new Error("Please sign in again.");
    return accessToken;
  }

  async function pull() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await Promise.all([refresh(), friends.refresh()]);
    } finally {
      setRefreshing(false);
    }
  }

  async function copy(what: "code" | "link") {
    const text = what === "code" ? code : link;
    if (!text) return;
    await Clipboard.setStringAsync(text);
    setCopied(what);
    setTimeout(() => setCopied((current) => (current === what ? null : current)), 1600);
  }

  async function share() {
    if (!code) return;
    const message = link
      ? `Ride with Wheelers and name your own price. Start with my code ${code}: ${link}`
      : `Ride with Wheelers and name your own price. Use my referral code ${code}.`;
    await Share.share({ message }).catch(() => undefined);
  }

  async function addFriendCode() {
    const entered = tidyCode(friendCode);
    if (entered.length < 4 || adding) return;
    setAdding(true);
    setAddError(null);
    try {
      await applyReferralCode({ accessToken: await token(), code: entered });
      setAdded(true);
      setFriendCode("");
      void refresh();
    } catch (failure) {
      const reason = failure instanceof Error ? failure.message : "";
      if (/already/i.test(reason)) {
        // One is on the account already: nothing to fix.
        setAdded(true);
        setFriendCode("");
        void refresh();
        return;
      }
      setAddError(referralRefusal(reason, entered) ?? toUserMessage(failure, "That code could not be added. Check it and try again."));
    } finally {
      setAdding(false);
    }
  }

  /** It cannot be changed afterwards: say so, and point a friend's code to the right box. */
  function confirmOwnCode() {
    const chosen = tidyCode(wanted);
    if (chosen.length < 4 || saving) return;
    Alert.alert(
      `Make ${chosen} your own code?`,
      `${chosen} will be your code for inviting friends. It can't be changed later.\n\nIf a friend gave you ${chosen}, add it under "Got a code from a friend?" instead.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Create my code", onPress: () => void saveOwnCode() },
      ],
    );
  }

  async function saveOwnCode() {
    const chosen = tidyCode(wanted);
    if (chosen.length < 4 || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await setReferralCode({ accessToken: await token(), code: chosen });
      await refresh();
      setWanted("");
    } catch (failure) {
      setSaveError(toUserMessage(failure, "That code could not be saved. Try another one."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <RScreen
      bounces
      contentStyle={styles.screen}
      refreshControl={
        <RefreshControl
          colors={[colors.orange]}
          onRefresh={() => void pull()}
          refreshing={refreshing}
          tintColor={colors.orange}
        />
      }
      scroll>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <RBack />
        <RText accessibilityRole="header" variant="title">
          Invite friends
        </RText>
      </View>

      {/* A friend's code first, until one is on the account: what most people come here for. */}
      {!hasFriendCode ? (
        <RCard style={styles.block}>
          <RInput
            autoCapitalize="characters"
            autoCorrect={false}
            error={addError}
            label="Got a code from a friend or a driver?"
            maxLength={12}
            onChangeText={(value) => {
              setFriendCode(tidyCode(value));
              setAddError(null);
            }}
            onSubmitEditing={() => void addFriendCode()}
            placeholder="Enter their code"
            returnKeyType="done"
            valid={tidyCode(friendCode).length >= 4}
            value={friendCode}
          />
          <RButton
            disabled={tidyCode(friendCode).length < 4}
            loading={adding}
            onPress={() => void addFriendCode()}
            size="md"
            title="Add code"
            variant="dark"
          />
        </RCard>
      ) : null}

      {creating ? (
        <RCard style={styles.codeCard} tone="ink">
          <RText color={colors.orange} variant="heading">
            Create your own code
          </RText>
          <RText color={colors.onInkMuted} variant="small">
            For inviting friends: your name, your nickname, anything they will remember.
          </RText>
        </RCard>
      ) : (
        <RCard style={styles.codeCard} tone="ink">
          <RText color={colors.onInkMuted} variant="small">
            Your referral code
          </RText>
          <Text adjustsFontSizeToFit maxFontSizeMultiplier={1.1} numberOfLines={1} selectable style={styles.code}>
            {code || (loading ? "…" : "Not available")}
          </Text>
          <View style={styles.codeActions}>
            <RButton disabled={!code} onPress={() => void share()} size="md" style={styles.flex} title="Share" />
            <RButton
              disabled={!code}
              onPress={() => void copy("code")}
              size="md"
              style={styles.flex}
              title={copied === "code" ? "Copied" : "Copy code"}
              variant="onInk"
            />
          </View>
        </RCard>
      )}

      {creating ? (
        <RCard style={styles.block} tone="outline">
          <RInput
            autoCapitalize="characters"
            autoCorrect={false}
            error={saveError}
            hint="4 to 12 letters or numbers. It can't be changed later."
            label="Your own code"
            maxLength={12}
            onChangeText={(value) => {
              setWanted(tidyCode(value));
              setSaveError(null);
            }}
            onSubmitEditing={confirmOwnCode}
            placeholder="TIMI"
            returnKeyType="done"
            valid={tidyCode(wanted).length >= 4}
            value={wanted}
          />
          <View style={styles.row}>
            <RButton
              disabled={tidyCode(wanted).length < 4}
              loading={saving}
              onPress={confirmOwnCode}
              size="md"
              style={styles.flex}
              title="Create my code"
              variant="dark"
            />
          </View>
        </RCard>
      ) : null}

      {link ? (
        <RCard style={styles.qrCard}>
          <View
            accessibilityLabel={`QR code for your referral code ${code}`}
            accessibilityRole="image"
            style={styles.qrFrame}>
            <QRCodeStyled color={colors.ink} data={link} padding={12} pieceSize={5} style={styles.qr} />
          </View>
          <RText color={colors.muted} style={styles.center} variant="small">
            A friend scans this with their camera to start with your code.
          </RText>
          <RLink
            color={colors.orangeText}
            onPress={() => void copy("link")}
            title={copied === "link" ? "Link copied" : "Copy link"}
          />
        </RCard>
      ) : null}

      {hasFriendCode ? (
        <RCard style={styles.block}>
          <View style={styles.doneRow}>
            <Ionicons color={colors.green} name="checkmark-circle" size={22} />
            <RText style={styles.flex} variant="bodyBold">
              A referral code is on your account.
            </RText>
          </View>
        </RCard>
      ) : null}

      <View style={styles.stats}>
        <Stat label="Friends joined" value={summary ? String(joinedCount(summary)) : "…"} tone="ink" />
        <Stat label="Friends who rode" value={summary ? String(summary.qualifiedReferrals) : "…"} />
      </View>
      {/* Cashback given before referrals stopped paying stays to spend: shown only while there is some. */}
      {summary && summary.availableCashbackNgn > 0 ? (
        <RText color={colors.muted} variant="small">
          You have {naira(summary.availableCashbackNgn)} ride cashback from earlier referrals to use.
        </RText>
      ) : null}

      {friends.data && friends.data.items.length > 0 ? (
        <RCard style={styles.block}>
          <RText variant="label">PEOPLE YOU INVITED</RText>
          {friends.data.items.map((friend) => (
            <View key={friend.id} style={styles.friend}>
              <Ionicons
                color={friendHasRidden(friend) ? colors.green : colors.muted}
                name={friendHasRidden(friend) ? "checkmark-circle" : "time-outline"}
                size={20}
              />
              <RText numberOfLines={1} style={styles.flex} variant="bodyBold">
                {friend.referredUser}
              </RText>
              <RText color={colors.muted} variant="small">
                {friendHasRidden(friend) ? "Has ridden" : "Yet to ride"} · {joinedOn(friend)}
              </RText>
            </View>
          ))}
        </RCard>
      ) : null}

      {error && !summary ? (
        <View style={styles.errorBox}>
          <RText accessibilityLiveRegion="polite" color={colors.danger} variant="smallBold">
            {error}
          </RText>
          <RButton onPress={() => void pull()} size="md" title="Try again" variant="ghost" />
        </View>
      ) : null}

      <View style={styles.rules}>
        <RText variant="label">HOW IT WORKS</RText>
        <Rule text="Share your link or QR code. It opens WhatsApp with your code typed for your friend to send." />
        <Rule text="Friends on the app can type your code when they sign up." />
        <Rule text="Everyone who joins with your code shows here, and whether they have taken a ride." />
      </View>
    </RScreen>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "ink" }) {
  const onInk = tone === "ink";
  return (
    <RCard style={styles.stat} tone={onInk ? "ink" : "card"}>
      <Text
        adjustsFontSizeToFit
        maxFontSizeMultiplier={1.1}
        numberOfLines={1}
        style={[styles.statValue, onInk ? styles.statValueOnInk : null]}>
        {value}
      </Text>
      <RText color={onInk ? colors.onInkMuted : colors.muted} variant="caption">
        {label}
      </RText>
    </RCard>
  );
}

function Rule({ text }: { text: string }) {
  return (
    <View style={styles.rule}>
      <Ionicons color={colors.orangeText} name="checkmark" size={18} style={styles.ruleIcon} />
      <RText style={styles.flex} variant="small">
        {text}
      </RText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: 12, gap: 14 },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  flex: { flex: 1 },
  start: { alignSelf: "flex-start", paddingHorizontal: 0 },
  center: { textAlign: "center" },
  row: { flexDirection: "row", gap: 10 },

  codeCard: { gap: 10, padding: 20 },
  code: {
    fontFamily: fonts.display,
    fontSize: 40,
    lineHeight: 46,
    letterSpacing: 2,
    color: colors.orange,
    fontVariant: ["tabular-nums"],
  },
  codeActions: { flexDirection: "row", gap: 10 },

  block: { gap: 12 },
  doneRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  friend: { flexDirection: "row", alignItems: "center", gap: 10 },

  qrCard: { alignItems: "center", gap: 10 },
  qrFrame: { borderRadius: 16, borderWidth: 2, borderColor: colors.ink, backgroundColor: "#FFFFFF", overflow: "hidden" },
  qr: { backgroundColor: "#FFFFFF" },

  stats: { flexDirection: "row", gap: 10 },
  stat: { flex: 1, padding: 14, borderRadius: 18, gap: 2 },
  statValue: { fontFamily: fonts.display, fontSize: 24, lineHeight: 28, color: colors.ink, fontVariant: ["tabular-nums"] },
  statValueOnInk: { color: colors.orange },

  errorBox: { gap: 10 },
  rules: { gap: 10, paddingTop: 4 },
  rule: { flexDirection: "row", gap: 10 },
  ruleIcon: { marginTop: 1 },
});
