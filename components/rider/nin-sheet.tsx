import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, TextInput, View } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useKeyboardHeight } from "@/hooks/use-keyboard";

import { RButton, RText, rider } from "@/components/rider/kit";
import { getAccessTokenWithRetry } from "@/lib/access-token";
import { getNinPrompt, sendNinPrompt, sendRiderNin } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cleanNinInput, markNinAsked, NIN_SHOW_TIMEOUT_MS, ninSheetMayOpen, releaseNinAsk } from "@/lib/nin-prompt";

const { colors, fonts } = rider;

/**
 * The NIN popup on Home (Timi, 18 Nov 2026). Opens a moment after Home settles when the server says it is due, and
 * never during a search or a trip. No Skip button: a tap outside (or Back) closes it, and the server counts that.
 */
export function NinSheet({ rideActive }: { rideActive: boolean }) {
  const focused = useIsFocused();
  const { getAccessToken, user } = useAuth();
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const [open, setOpen] = useState(false);
  const [retry, setRetry] = useState(false);
  const [nin, setNin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const done = useRef(false);
  const shownRef = useRef(false);
  const notShownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user || !ninSheetMayOpen({ focused, rideActive, otherSheet: false })) return;
    // A moment after Home settles (an email or passkey ask comes first).
    const timer = setTimeout(() => {
      void (async () => {
        const token = await getAccessTokenWithRetry(getAccessToken).catch(() => null);
        if (!token || !ninSheetMayOpen({ focused: true, rideActive, otherSheet: false })) return;
        const due = await getNinPrompt(token).catch(() => null);
        if (!due?.ask) return;
        markNinAsked();
        setRetry(due.retry);
        shownRef.current = false;
        setOpen(true);
        // Counted as shown only when it is on screen (onShow). On iOS a sheet asked for while another one or a
        // system prompt is up never appears: then it is put away uncounted and Home may try again.
        notShownTimer.current = setTimeout(() => {
          if (shownRef.current) return;
          setOpen(false);
          releaseNinAsk();
        }, NIN_SHOW_TIMEOUT_MS);
      })();
    }, 2500);
    return () => clearTimeout(timer);
  }, [focused, rideActive, user, getAccessToken]);

  useEffect(() => () => { if (notShownTimer.current) clearTimeout(notShownTimer.current); }, []);

  const onShow = () => {
    if (shownRef.current) return;
    shownRef.current = true;
    if (notShownTimer.current) clearTimeout(notShownTimer.current);
    void (async () => {
      const token = await getAccessTokenWithRetry(getAccessToken).catch(() => null);
      if (token) await sendNinPrompt(token, "shown").catch(() => undefined);
    })();
  };

  // A search or a trip starting under it: put away (not counted as a close).
  useEffect(() => {
    if (rideActive && open) setOpen(false);
  }, [rideActive, open]);

  const close = () => {
    setOpen(false);
    if (done.current || !shownRef.current) return;
    void (async () => {
      const token = await getAccessTokenWithRetry(getAccessToken).catch(() => null);
      if (token) await sendNinPrompt(token, "closed").catch(() => undefined);
    })();
  };

  const verify = async () => {
    const clean = cleanNinInput(nin);
    if (!clean) {
      setError("Your NIN is 11 digits.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const token = await getAccessTokenWithRetry(getAccessToken);
      if (!token) throw new Error("Sign in again to add your NIN.");
      await sendRiderNin(token, clean, "");
      done.current = true;
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not check your NIN. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal animationType="fade" onRequestClose={close} onShow={onShow} statusBarTranslucent transparent visible={open}>
      {/* In the middle of the screen, and of the space above the keyboard while typing (iPhone and Android). */}
      <Pressable
        accessibilityLabel="Close"
        onPress={close}
        style={[styles.backdrop, { paddingTop: insets.top + 16, paddingBottom: Math.max(insets.bottom, keyboardHeight) + 16 }]}>
        <Pressable onPress={() => undefined} style={styles.card}>
          <View style={styles.copy}>
            <RText accessibilityRole="header" variant="heading">{retry ? "Check your NIN" : "Add your NIN"}</RText>
            <RText color={colors.muted} variant="small">
              {retry ? "We couldn't match the last one. Type it again." : "It keeps your account and your trips safe."}
            </RText>
          </View>
          <TextInput
            accessibilityLabel="NIN"
            keyboardType="number-pad"
            maxLength={11}
            onChangeText={(t) => { setNin(t.replace(/\D/g, "").slice(0, 11)); setError(null); }}
            placeholder="11-digit NIN"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={nin}
          />
          {error ? <RText color={colors.danger} variant="small">{error}</RText> : null}
          <RButton loading={busy} onPress={() => void verify()} title="Verify" />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(13,13,13,0.5)", justifyContent: "center", paddingHorizontal: rider.gutter },
  card: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
    backgroundColor: colors.cream,
    borderRadius: rider.radius.sheet,
    padding: 20,
    gap: 12,
  },
  copy: { gap: 4 },
  input: {
    height: 56,
    borderRadius: rider.radius.md,
    borderWidth: 2,
    borderColor: colors.ink,
    paddingHorizontal: 16,
    fontSize: 20,
    letterSpacing: 2,
    fontFamily: fonts.display,
    color: colors.ink,
    backgroundColor: colors.card,
  },
});
