import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter, type Href } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { RAvatar, RIconDot, RLink, RRow, RScreen, RText, rider } from "@/components/rider/kit";
import { money } from "@/components/rider/wallet-format";
import { getAccessTokenWithRetry, getStoredLocalAccessToken } from "@/lib/access-token";
import { getCurrentProfile, isBackendConfigured } from "@/lib/api";
import { offersBothSides, publicEntryRoute, switchAppSide } from "@/lib/app-variant";
import { useAuth } from "@/lib/auth";
import { clearLogoutPending, clearStoredAuthState, markLogoutPending } from "@/lib/auth-state";
import { useWalletOverview } from "@/lib/wallet-overview";

type IconName = keyof typeof Ionicons.glyphMap;

type YouProfile = {
  name: string;
  /** The phone number; the email (or @username) when there is no number. */
  contact: string;
};

const ROWS: { title: string; subtitle: string; icon: IconName; href: Href }[] = [
  {
    title: "Saved places",
    subtitle: "Home, work and places you go often",
    icon: "bookmark-outline",
    href: "/saved-places" as Href,
  },
  {
    title: "Notifications",
    subtitle: "Trip updates and offers",
    icon: "notifications-outline",
    href: "/rider/notifications",
  },
  {
    title: "Travel between cities",
    subtitle: "Book a trip to another city",
    icon: "bus-outline",
    href: "/rider/interstate",
  },
  {
    title: "Group ride",
    subtitle: "Share a ride with other riders",
    icon: "people-outline",
    href: "/group-ride",
  },
  {
    title: "Invite friends",
    subtitle: "Share your code and track ride cashback",
    icon: "gift-outline",
    href: "/growth/referral",
  },
  {
    title: "Security PIN",
    subtitle: "Lock the app with a PIN",
    icon: "lock-closed-outline",
    href: "/profile/security-pin",
  },
  {
    title: "Help and support",
    subtitle: "Get help with a trip or payment",
    icon: "help-circle-outline",
    href: "/support/help-center",
  },
];

function titleCaseSegment(value: string): string {
  if (!value) {
    return value;
  }

  return value[0]!.toUpperCase() + value.slice(1);
}

function deriveNameFromEmail(email: string): string {
  const [localPart = ""] = email.split("@");
  const normalized = localPart.replace(/[._-]+/g, " ").trim();

  if (!normalized) {
    return "";
  }

  return normalized
    .split(/\s+/)
    .filter((segment) => segment.length > 0)
    .map(titleCaseSegment)
    .join(" ");
}

function deriveNameFromUsername(username: string): string {
  return username
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((segment) => segment.length > 0)
    .map(titleCaseSegment)
    .join(" ");
}

function buildProfile(input?: {
  name?: string | null;
  email?: string | null;
  username?: string | null;
  phone?: string | null;
}): YouProfile {
  const email = input?.email?.trim() || "";
  const username = input?.username?.trim() || "";
  const phone = input?.phone?.trim() || "";
  const name =
    input?.name?.trim() ||
    (username ? deriveNameFromUsername(username) : "") ||
    (email ? deriveNameFromEmail(email) : "");

  return {
    name,
    contact: phone || email || (username ? `@${username}` : ""),
  };
}

/** The "You" tab: who is signed in, and everything that is not a ride or the wallet. */
export default function RiderYouScreen() {
  const router = useRouter();
  const { getAccessToken, logout, user, isReady } = useAuth();
  const { overview } = useWalletOverview();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [profile, setProfile] = useState<YouProfile>(buildProfile());

  const loadProfile = useCallback(async () => {
    if (!isReady || !isBackendConfigured()) {
      setProfile(buildProfile());
      return;
    }

    const accessToken = user
      ? await getAccessTokenWithRetry(getAccessToken)
      : await getStoredLocalAccessToken();
    if (!accessToken) {
      return;
    }

    try {
      const response = await getCurrentProfile({ accessToken });
      setProfile(
        buildProfile({
          name: response.user.name ?? undefined,
          email: response.user.email ?? undefined,
          username: response.user.username,
          phone: response.user.phone,
        }),
      );
    } catch {
      // Keep what is on screen: a failed refresh should not blank the name.
    }
  }, [getAccessToken, isReady, user]);

  useFocusEffect(
    useCallback(() => {
      void loadProfile();
    }, [loadProfile]),
  );

  async function handleLogout() {
    if (isLoggingOut) {
      return;
    }

    setIsLoggingOut(true);
    try {
      await markLogoutPending();
      await clearStoredAuthState();
      router.replace({
        pathname: publicEntryRoute,
        params: { logout: "1" },
      });
      void logout().finally(() => {
        void clearLogoutPending();
      });
    } catch (error) {
      Alert.alert(
        "Logout failed",
        error instanceof Error ? error.message : "Could not log you out.",
      );
    } finally {
      setIsLoggingOut(false);
    }
  }

  async function handleSwitchToDriver() {
    if (isSwitching) {
      return;
    }

    setIsSwitching(true);
    try {
      // The app restarts on the driver side; nothing after this runs when it does.
      await switchAppSide("driver");
    } catch (error) {
      Alert.alert(
        "Could not switch",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setIsSwitching(false);
    }
  }

  return (
    <RScreen
      contentStyle={styles.container}
      // The tab bar already keeps clear of the bottom inset.
      safeAreaEdges={["top", "left", "right"]}
      scroll>
      <StatusBar backgroundColor={rider.colors.cream} style="dark" />

      <View style={styles.identity}>
        <RAvatar name={profile.name || null} size={68} />
        <View style={styles.identityCopy}>
          <RText accessibilityRole="header" numberOfLines={2} variant="title">
            {profile.name || "Your account"}
          </RText>
          {profile.contact ? (
            <RText color={rider.colors.muted} numberOfLines={1} style={styles.contact}>
              {profile.contact}
            </RText>
          ) : null}
        </View>
        <Pressable
          accessibilityLabel="Edit profile"
          accessibilityRole="button"
          onPress={() => router.push("/profile/edit-profile")}
          style={({ pressed }) => [styles.editButton, pressed ? styles.pressed : null]}>
          <Text maxFontSizeMultiplier={1.15} style={styles.editText}>
            Edit
          </Text>
        </Pressable>
      </View>

      {overview ? (
        <Pressable
          accessibilityLabel={`Wallet balance ${money(overview.balanceNgn)}. Open wallet`}
          accessibilityRole="button"
          onPress={() => router.push("/rider/wallet")}
          style={({ pressed }) => [styles.walletTile, pressed ? styles.pressed : null]}>
          <View>
            <Text maxFontSizeMultiplier={1.15} numberOfLines={1} style={styles.walletFigure}>
              {money(overview.balanceNgn)}
            </Text>
            <RText color={rider.colors.onInkMuted} variant="caption">
              wallet
            </RText>
          </View>
          <Ionicons color={rider.colors.onInkMuted} name="chevron-forward" size={18} />
        </Pressable>
      ) : null}

      <View>
        {ROWS.map((row, index) => (
          <RRow
            key={row.title}
            last={index === ROWS.length - 1}
            left={<RIconDot name={row.icon} />}
            onPress={() => router.push(row.href)}
            subtitle={row.subtitle}
            title={row.title}
          />
        ))}
      </View>

      {offersBothSides ? (
        <Pressable
          accessibilityLabel="Switch to driver. Use the same account to drive"
          accessibilityRole="button"
          accessibilityState={{ busy: isSwitching, disabled: isSwitching }}
          disabled={isSwitching}
          onPress={() => void handleSwitchToDriver()}
          style={({ pressed }) => [styles.switchCard, pressed || isSwitching ? styles.pressed : null]}>
          <View style={styles.switchCopy}>
            <RText color={rider.colors.orange} variant="bodyBold">
              Switch to driver
            </RText>
            <RText color={rider.colors.onInkMuted} variant="small">
              Use the same account to drive
            </RText>
          </View>
          <Ionicons color={rider.colors.orange} name="arrow-forward" size={20} />
        </Pressable>
      ) : null}

      <RLink
        accessibilityLabel="Log out"
        color={rider.colors.danger}
        disabled={isLoggingOut}
        onPress={() => void handleLogout()}
        title={isLoggingOut ? "Logging out..." : "Log out"}
      />
    </RScreen>
  );
}

const styles = StyleSheet.create({
  container: { gap: 14, paddingTop: 12, paddingBottom: 16 },
  pressed: { opacity: 0.72 },

  identity: { flexDirection: "row", alignItems: "center", gap: 14 },
  identityCopy: { flex: 1, minWidth: 0, gap: 2 },
  contact: { fontSize: 15, lineHeight: 21, fontVariant: ["tabular-nums"] },
  editButton: {
    height: 44,
    paddingHorizontal: 14,
    borderRadius: rider.radius.sm,
    borderWidth: 2,
    borderColor: rider.colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  editText: { fontFamily: rider.fonts.bold, fontSize: 15, color: rider.colors.ink },

  walletTile: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    minHeight: 60,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: rider.radius.md,
    backgroundColor: rider.colors.ink,
  },
  walletFigure: {
    fontFamily: rider.fonts.display,
    fontSize: 22,
    lineHeight: 26,
    color: rider.colors.orange,
    fontVariant: ["tabular-nums"],
  },

  switchCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    minHeight: 60,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: rider.radius.lg,
    backgroundColor: rider.colors.ink,
  },
  switchCopy: { flex: 1, minWidth: 0 },
});
