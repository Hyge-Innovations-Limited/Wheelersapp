import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet } from "react-native";

import { AppText } from "@/components/app-text";
import { publicEntryRoute } from "@/lib/app-variant";
import { useAuth } from "@/lib/auth";
import { clearLogoutPending, clearStoredAuthState, markLogoutPending } from "@/lib/auth-state";
import { theme } from "@/theme";

/**
 * The only way out of verification: signing out. Verification locks a
 * driver in until they are approved, so this keeps someone on the wrong
 * account from being stuck there. Same steps as Settings → Log out.
 */
export function OnboardingSignOut() {
  const router = useRouter();
  const { logout } = useAuth();
  const [busy, setBusy] = useState(false);

  const signOut = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await markLogoutPending();
      await clearStoredAuthState();
      router.replace({ pathname: publicEntryRoute, params: { logout: "1" } } as never);
      void logout().finally(() => {
        void clearLogoutPending();
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Pressable onPress={() => void signOut()} hitSlop={12} style={styles.link} accessibilityRole="button">
      <AppText variant="bodySmall" color={theme.colors.muted}>
        {busy ? "Signing out…" : "Not you? Sign out"}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  link: { alignSelf: "center", paddingVertical: theme.spacing.sm },
});
