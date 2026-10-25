import { useCallback, useEffect, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";

import { RButton, RCard, RText, rider } from "@/components/rider/kit";
import { getAccessTokenWithRetry } from "@/lib/access-token";
import { listPasskeys, removePasskey, type PasskeySummary } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toUserMessage } from "@/lib/error-messages";
import { addPasskeyForThisPhone } from "@/lib/passkey-account";
import { forgetPasskeyHere, PasskeyCancelled, passkeysAvailable, thisDeviceName } from "@/lib/passkeys";

const { colors, fonts } = rider;

function when(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Passkeys on the Security screen: the phones this account signs in on with
 * Face ID or a fingerprint, one to add for this phone, and a way to remove
 * any. Not shown on a build or phone that cannot use them.
 */
export function RiderPasskeys() {
  const { getAccessToken } = useAuth();
  const [passkeys, setPasskeys] = useState<PasskeySummary[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const available = passkeysAvailable();

  const load = useCallback(async () => {
    try {
      const accessToken = await getAccessTokenWithRetry(getAccessToken);
      if (!accessToken) return;
      setPasskeys((await listPasskeys({ accessToken })).passkeys);
    } catch (failure) {
      setError(toUserMessage(failure, "Your passkeys could not be loaded. Try again."));
    }
  }, [getAccessToken]);

  useEffect(() => {
    if (available) void load();
  }, [available, load]);

  if (!available) return null;

  async function add() {
    if (busy) return;
    setBusy("add");
    setError(null);
    try {
      const accessToken = await getAccessTokenWithRetry(getAccessToken);
      if (!accessToken) throw new Error("Please sign in again.");
      await addPasskeyForThisPhone(accessToken);
      await load();
    } catch (failure) {
      if (!(failure instanceof PasskeyCancelled)) setError(toUserMessage(failure, "The passkey could not be set up. Try again."));
    } finally {
      setBusy(null);
    }
  }

  function remove(passkey: PasskeySummary) {
    Alert.alert("Remove this passkey?", `${passkey.deviceName ?? "This phone"} will sign in with a code again.`, [
      { text: "Keep it", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () =>
          void (async () => {
            setBusy(passkey.id);
            setError(null);
            try {
              const accessToken = await getAccessTokenWithRetry(getAccessToken);
              if (!accessToken) throw new Error("Please sign in again.");
              await removePasskey({ accessToken, id: passkey.id });
              // None left that could be this phone's: sign-in asks for the phone number again.
              const left = await listPasskeys({ accessToken }).catch(() => null);
              if (left && !left.passkeys.some((p) => (p.deviceName ?? thisDeviceName()) === thisDeviceName())) await forgetPasskeyHere();
              await load();
            } catch (failure) {
              setError(toUserMessage(failure, "That passkey could not be removed. Try again."));
            } finally {
              setBusy(null);
            }
          })(),
      },
    ]);
  }

  return (
    <RCard style={styles.block}>
      <RText variant="heading">Passkeys</RText>
      <RText color={colors.muted} variant="small">
        Sign in with Face ID or your fingerprint instead of waiting for a code.
      </RText>
      {passkeys?.map((passkey) => (
        <View key={passkey.id} style={styles.row}>
          <View style={styles.flex}>
            <RText variant="bodyBold">{passkey.deviceName ?? "A phone"}</RText>
            <RText color={colors.muted} variant="small">
              Added {when(passkey.createdAt)}
              {passkey.lastUsedAt ? ` · last used ${when(passkey.lastUsedAt)}` : ""}
            </RText>
          </View>
          <RButton loading={busy === passkey.id} onPress={() => remove(passkey)} size="md" title="Remove" variant="ghost" />
        </View>
      ))}
      {error ? (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <RButton loading={busy === "add"} onPress={() => void add()} title="Add a passkey for this phone" variant="dark" />
    </RCard>
  );
}

const styles = StyleSheet.create({
  block: { gap: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  flex: { flex: 1 },
  error: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 19, color: colors.danger },
});
