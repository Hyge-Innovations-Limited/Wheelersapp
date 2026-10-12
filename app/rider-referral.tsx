import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { RefreshControl, Share, StyleSheet, Text, View } from "react-native";
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

const { colors, fonts } = rider;

/** What a code may be made of, as it is typed: capitals and digits, twelve at most. */
const tidyCode = (typed: string) => typed.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);

/**
 * Invite friends: the rider's code, link and QR code to share; a box to add a
 * code someone gave them; a way to choose their own code; and what their
 * referrals have earned.
 */
export default function RiderReferralScreen() {
  const { getAccessToken } = useAuth();
  const { data: summary, loading, error, refresh } = useCachedQuery<ReferralSummaryResponse>({
    key: "referral.summary",
    fetcher: (accessToken) => getReferralSummary({ accessToken }),
    staleMs: 60_000,
    enabled: isBackendConfigured(),
  });

  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  // Adding a code someone gave you.
  const [friendCode, setFriendCode] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);

  // Choosing your own code.
  const [editing, setEditing] = useState(false);
  const [wanted, setWanted] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const code = summary?.code ?? "";
  const link = summary?.shareLink ?? "";
  const hasFriendCode = added || summary?.hasAppliedCode === true;

  async function token(): Promise<string> {
    const accessToken = await getAccessTokenWithRetry(getAccessToken);
    if (!accessToken) throw new Error("Please sign in again.");
    return accessToken;
  }

  async function pull() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await refresh();
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
      setAddError(toUserMessage(failure, "That code could not be added. Check it and try again."));
    } finally {
      setAdding(false);
    }
  }

  async function saveOwnCode() {
    const chosen = tidyCode(wanted);
    if (chosen.length < 4 || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await setReferralCode({ accessToken: await token(), code: chosen });
      await refresh();
      setEditing(false);
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

      <RCard style={styles.codeCard} tone="ink">
        <RText color={colors.onInkMuted} variant="small">
          Your referral code
        </RText>
        <Text adjustsFontSizeToFit maxFontSizeMultiplier={1.1} numberOfLines={1} selectable style={styles.code}>
          {code || (loading ? "…" : "Not available")}
        </Text>
        <View style={styles.codeActions}>
          <RButton
            disabled={!code}
            onPress={() => void share()}
            size="md"
            style={styles.flex}
            title="Share"
          />
          <RButton
            disabled={!code}
            onPress={() => void copy("code")}
            size="md"
            style={styles.flex}
            title={copied === "code" ? "Copied" : "Copy code"}
            variant="onInk"
          />
        </View>
        {editing ? null : (
          <RLink
            color={colors.orange}
            disabled={!code}
            onPress={() => {
              setEditing(true);
              setSaveError(null);
            }}
            style={styles.start}
            title="Choose your own code"
          />
        )}
      </RCard>

      {editing ? (
        <RCard style={styles.block} tone="outline">
          <RInput
            autoCapitalize="characters"
            autoCorrect={false}
            autoFocus
            error={saveError}
            hint="4 to 12 letters or numbers. Your old code stops working."
            label="Your own code"
            maxLength={12}
            onChangeText={(value) => {
              setWanted(tidyCode(value));
              setSaveError(null);
            }}
            placeholder="TIMI"
            valid={tidyCode(wanted).length >= 4}
            value={wanted}
          />
          <View style={styles.row}>
            <RButton
              onPress={() => {
                setEditing(false);
                setWanted("");
                setSaveError(null);
              }}
              size="md"
              style={styles.flex}
              title="Cancel"
              variant="ghost"
            />
            <RButton
              disabled={tidyCode(wanted).length < 4}
              loading={saving}
              onPress={() => void saveOwnCode()}
              size="md"
              style={styles.flex}
              title="Save code"
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

      <RCard style={styles.block}>
        {hasFriendCode ? (
          <View style={styles.doneRow}>
            <Ionicons color={colors.green} name="checkmark-circle" size={22} />
            <RText style={styles.flex} variant="bodyBold">
              A referral code is on your account.
            </RText>
          </View>
        ) : (
          <>
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
          </>
        )}
      </RCard>

      <View style={styles.stats}>
        <Stat label="Cashback to use" value={summary ? naira(summary.availableCashbackNgn) : "…"} tone="ink" />
        <Stat label="Frozen" value={summary ? naira(summary.frozenCashbackNgn) : "…"} />
      </View>
      <View style={styles.stats}>
        <Stat label="Friends who rode" value={summary ? String(summary.qualifiedReferrals) : "…"} />
        <Stat label="Yet to ride" value={summary ? String(summary.pendingReferrals) : "…"} />
      </View>

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
        <Rule text="A friend who rides within 30 days of using your code earns you ₦1,000 ride cashback." />
        <Rule text="If they have not ridden after 30 days, you earn ₦500." />
        <Rule text="Cashback is for rides only. Unused cashback freezes after 30 days; one new referral unfreezes it." />
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
