import { Ionicons } from "@expo/vector-icons";
import { useRouter, type Href } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { Alert, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";

import { RAvatar, RIconDot, RLink, RRow, RScreen, RText, rider } from "@/components/rider/kit";
import { money } from "@/components/rider/wallet-format";
import { offersBothSides, publicEntryRoute, switchAppSide } from "@/lib/app-variant";
import { useAuth } from "@/lib/auth";
import { clearLogoutPending, clearStoredAuthState, markLogoutPending } from "@/lib/auth-state";
import { openPrivacy, openTerms } from "@/lib/legal-links";
import { useRiderProfile } from "@/lib/rider-profile";
import { clearRiderTripsCache } from "@/lib/rider-trips";
import { clearNameNeeded } from "@/lib/rider-sign-in-state";
import { clearSavedPlaces } from "@/lib/saved-places";
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
  // Travel between cities is switched off in the app for now. The screens
  // stay in the code (app/rider/interstate.tsx); bring this row back to
  // bring them back.
  // {
  //   title: "Travel between cities",
  //   subtitle: "Book a trip to another city",
  //   icon: "bus-outline",
  //   href: "/rider/interstate",
  // },
  {
    title: "Group ride",
    subtitle: "Coming soon",
    icon: "people-outline",
    href: "/group-ride",
  },
  {
    title: "Invite friends",
    subtitle: "Create your code and earn ride cashback",
    icon: "gift-outline",
    href: "/rider-referral",
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
  const { logout } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  // Kept on the phone and shown at once; fetched again when it is old, on a
  // pull, or after an edit. It is not fetched every time this tab is opened.
  const { user: account, refresh: refreshProfile } = useRiderProfile();
  const { overview, refresh: refreshWallet } = useWalletOverview();
  const [refreshing, setRefreshing] = useState(false);
  const profile = buildProfile(
    account
      ? { name: account.name, email: account.email, username: account.username, phone: account.phone }
      : undefined,
  );

  async function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await Promise.all([refreshProfile(), refreshWallet()]);
    } finally {
      setRefreshing(false);
    }
  }

  async function handleLogout() {
    if (isLoggingOut) {
      return;
    }

    setIsLoggingOut(true);
    try {
      await markLogoutPending();
      await clearStoredAuthState();
      // Nothing of this rider's is left for the next person on this phone.
      clearRiderTripsCache();
      await clearSavedPlaces();
      await clearNameNeeded();
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

  /**
   * Driving is a separate account, so the rider is signed out first; the app
   * then restarts on the driver side at driver sign-in. Switching while still
   * signed in as a rider left the app half on each side.
   */
  async function switchToDriver() {
    if (isSwitching) {
      return;
    }

    setIsSwitching(true);
    try {
      await clearStoredAuthState();
      clearRiderTripsCache();
      await clearSavedPlaces();
      await clearNameNeeded();
      await logout().catch(() => undefined);
      // The app restarts here; nothing after this runs when it does.
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

  function handleSwitchToDriver() {
    Alert.alert(
      "Go to the driver side?",
      "You will be logged out as a rider. Your rider account stays: sign in with your phone number to come back.",
      [
        { text: "Stay", style: "cancel" },
        { text: "Switch", onPress: () => void switchToDriver() },
      ],
    );
  }

  return (
    <RScreen
      bounces
      contentStyle={styles.container}
      refreshControl={
        <RefreshControl
          colors={[rider.colors.orange]}
          onRefresh={() => void handleRefresh()}
          refreshing={refreshing}
          tintColor={rider.colors.orange}
        />
      }
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
          accessibilityLabel="Drive with Wheelers. Sign in as a driver, or apply to drive"
          accessibilityRole="button"
          accessibilityState={{ busy: isSwitching, disabled: isSwitching }}
          disabled={isSwitching}
          onPress={handleSwitchToDriver}
          style={({ pressed }) => [styles.switchCard, pressed || isSwitching ? styles.pressed : null]}>
          <View style={styles.switchCopy}>
            <RText color={rider.colors.orange} variant="bodyBold">
              Drive with Wheelers
            </RText>
            <RText color={rider.colors.onInkMuted} variant="small">
              Sign in as a driver, or apply to drive
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

      <View style={styles.legal}>
        <RLink accessibilityRole="link" color={rider.colors.muted} onPress={openTerms} title="Terms of Service" />
        <Text style={styles.legalDot}>·</Text>
        <RLink accessibilityRole="link" color={rider.colors.muted} onPress={openPrivacy} title="Privacy Policy" />
      </View>
    </RScreen>
  );
}

const styles = StyleSheet.create({
  container: { gap: 14, paddingTop: 12, paddingBottom: 16 },
  pressed: { opacity: 0.72 },
  legal: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  legalDot: { fontFamily: rider.fonts.semibold, fontSize: 15, color: rider.colors.muted },

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
