import { riderProfileChanged } from "@/lib/rider-profile";
import { Redirect, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { BrandLogo } from "@/components/brand-logo";
import { RButton, RCard, RInput, RLink, RPill, RScreen, RText, naira, rider } from "@/components/rider/kit";
import { getAccessTokenWithRetry } from "@/lib/access-token";
import { updateCurrentProfile } from "@/lib/api";
import { isDriverApp, publicEntryRoute } from "@/lib/app-variant";
import { useAuth } from "@/lib/auth";
import { toUserMessage } from "@/lib/error-messages";
import { looksLikeEmail } from "@/lib/rider-sign-in";
import { useWalletOverview } from "@/lib/wallet-overview";
import { useGoHome } from "@/hooks/use-go-home";

/** A number we already know: say so, show what came with it, offer to add an email. */
export default function RiderWelcomeBackScreen() {
  const goHome = useGoHome();
  const params = useLocalSearchParams<{ name?: string; email?: string }>();
  const name = typeof params.name === "string" ? params.name : "";
  const emailOnFile = typeof params.email === "string" ? params.email : "";

  const { getAccessToken } = useAuth();
  const { overview } = useWalletOverview();

  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isDriverApp) {
    return <Redirect href={publicEntryRoute} />;
  }

  const wantsEmail = !emailOnFile && email.trim().length > 0;

  async function goOn() {
    if (saving) return;
    if (!wantsEmail) {
      goHome();
      return;
    }
    if (!looksLikeEmail(email)) {
      setError("Enter a full email address, like name@example.com.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const accessToken = await getAccessTokenWithRetry(getAccessToken);
      if (!accessToken) throw new Error("Please sign in again.");
      await updateCurrentProfile({ accessToken, email: email.trim() });
      riderProfileChanged();
      goHome();
    } catch (failure) {
      setError(toUserMessage(failure, "We could not save that email. You can add it later."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <RScreen contentStyle={styles.content} scroll>
      <BrandLogo size={56} />

      <View style={styles.words}>
        <RPill icon="checkmark" label="Account found" />
        <RText variant="display">{name ? `Welcome back, ${name}` : "Welcome back"}</RText>
        <RText color={rider.colors.muted}>Your wallet and trips are ready.</RText>
      </View>

      <View style={styles.stats}>
        <RCard style={styles.stat} tone="ink">
          <RText color={rider.colors.orange} variant="figure" style={styles.statFigure}>
            {overview ? naira(overview.balanceNgn) : "…"}
          </RText>
          <RText color={rider.colors.onInkMuted} variant="caption">
            in your wallet
          </RText>
        </RCard>
      </View>

      {emailOnFile ? null : (
        <RInput
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect={false}
          error={error}
          hint="For your receipts."
          keyboardType="email-address"
          label="Email address"
          labelNote="(optional)"
          onChangeText={(value) => {
            setEmail(value);
            setError(null);
          }}
          placeholder="you@example.com"
          valid={looksLikeEmail(email)}
          value={email}
        />
      )}

      <View style={styles.spacer} />
      <RButton loading={saving} onPress={() => void goOn()} title="Continue" />
      {wantsEmail ? <RLink onPress={() => goHome()} title="Skip for now" /> : null}
    </RScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 20, gap: 18 },
  words: { gap: 10 },
  stats: { flexDirection: "row", gap: 10 },
  stat: { flex: 1, padding: 14, borderRadius: 18, gap: 2 },
  statFigure: { fontSize: 22, lineHeight: 26 },
  spacer: { flexGrow: 1, minHeight: 12 },
});
