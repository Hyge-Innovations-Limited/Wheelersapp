import { publicEntryRoute } from "@/lib/app-variant";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useAuth } from "@/lib/auth";
import { Href, useFocusEffect, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";

import { AppCard } from "@/components/app-card";
import { AppScreen } from "@/components/app-screen";
import { AppText } from "@/components/app-text";
import { SettingsRow } from "@/components/SettingsRow";
import { SettingOption, settingsOptions } from "@/data/mock";
import { getAccessTokenWithRetry, getStoredLocalAccessToken } from "@/lib/access-token";
import { getCurrentProfile, isBackendConfigured } from "@/lib/api";
import {
  clearLogoutPending,
  clearStoredAuthState,
  markLogoutPending,
} from "@/lib/auth-state";
import { theme } from "@/theme";

const accountSettingIds = new Set([
  "edit-profile",
  "notifications",
  "security",
]);
const accountActionIds = new Set(["logout"]);

const supportOptions = [
  {
    id: "help-center",
    icon: "help-outline",
    title: "Help Center",
    subtitle: "Browse answers for rides, billing, and account issues.",
    type: "navigation",
    route: "/support/help-center",
  },
  {
    id: "customer-support",
    icon: "chat-bubble-outline",
    title: "Customer Support",
    subtitle: "Start a live chat with the Wheelers support team.",
    type: "navigation",
    route: "/support/chat",
  },
] satisfies SettingOption[];

type SettingsProfile = {
  initials: string;
  name: string;
  email: string;
  verificationState: string;
};

function titleCaseSegment(value: string): string {
  if (!value) {
    return value;
  }

  return value[0].toUpperCase() + value.slice(1);
}

function deriveNameFromEmail(email: string): string {
  const [localPart] = email.split("@");
  const normalized = localPart
    .replace(/[._-]+/g, " ")
    .trim();

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

function deriveInitials(name: string): string {
  const firstName = name
    .split(/\s+/)
    .filter((segment) => segment.length > 0)
    .at(0);

  if (firstName) {
    return firstName.replace(/[^a-z0-9]/gi, "").slice(0, 2).toUpperCase();
  }

  const compact = name.replace(/\s+/g, "").slice(0, 2).toUpperCase();
  return compact;
}

function buildProfile(input?: {
  name?: string | null;
  email?: string | null;
  username?: string | null;
}): SettingsProfile {
  const email = input?.email?.trim() || "";
  const username = input?.username?.trim() || "";
  const name =
    input?.name?.trim() ||
    (username ? deriveNameFromUsername(username) : "") ||
    (email ? deriveNameFromEmail(email) : "");

  return {
    initials: deriveInitials(name),
    name,
    email: email || (username ? `@${username}` : "No email added"),
    verificationState: "Verified account",
  };
}

export default function SettingsScreen() {
  const router = useRouter();
  const { getAccessToken, logout, user, isReady } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [profile, setProfile] = useState<SettingsProfile>(
    buildProfile({
      name: undefined,
      email: undefined,
    }),
  );

  const loadProfile = useCallback(async () => {
    if (!isReady || !isBackendConfigured()) {
      setProfile(
        buildProfile({
          name: undefined,
          email: undefined,
        }),
      );
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
        }),
      );
    } catch {
      setProfile(
        buildProfile({
          name: undefined,
          email: undefined,
        }),
      );
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
    } finally {
      setIsLoggingOut(false);
    }
  }

  return (
    <SettingsScreenBody
      isLoggingOut={isLoggingOut}
      onLogout={handleLogout}
      profile={profile}
    />
  );
}

function SettingsScreenBody({
  isLoggingOut,
  onLogout,
  profile,
}: {
  isLoggingOut: boolean;
  onLogout: () => Promise<void>;
  profile: SettingsProfile;
}) {
  const router = useRouter();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const accountSettings = settingsOptions.filter((item) =>
    accountSettingIds.has(item.id),
  );
  const accountActions = settingsOptions.filter((item) =>
    accountActionIds.has(item.id),
  );

  async function handleRowPress(id: string, route?: string) {
    if (id === "customer-support") {
      Alert.alert(
        "Coming soon",
        "Customer support chat will be available here soon.",
      );
      return;
    }
    if (route) {
      router.push(route as Href);
      return;
    }
    if (id === "edit-profile") {
      router.push("/profile/edit-profile");
      return;
    }
    if (id === "security") {
      router.push("/profile/security-pin");
      return;
    }
    if (id === "referrals") {
      router.push("/growth/referral");
      return;
    }
    if (id === "logout") {
      if (isLoggingOut) {
        return;
      }

      try {
        await onLogout();
      } catch (error) {
        Alert.alert(
          "Logout failed",
          error instanceof Error ? error.message : "Could not log you out.",
        );
      }
    }
  }

  function renderRows(items: SettingOption[], options?: { support?: boolean }) {
    return items.map((item, index) => (
      <SettingsRow
        destructive={item.type === "danger"}
        highlight={Boolean(options?.support && item.id === "customer-support")}
        icon={item.icon}
        key={item.id}
        onPress={
          item.type === "navigation" || item.type === "danger"
            ? () => void handleRowPress(item.id, item.route)
            : undefined
        }
        onToggle={
          item.type === "toggle"
            ? () => setNotificationsEnabled((current) => !current)
            : undefined
        }
        showDivider={index < items.length - 1}
        subtitle={item.subtitle}
        title={item.id === "logout" && isLoggingOut ? "Logging out..." : item.title}
        toggleValue={item.type === "toggle" ? notificationsEnabled : undefined}
        value={item.type === "value" ? item.value : undefined}
      />
    ));
  }

  return (
    <AppScreen
      backgroundColor={theme.colors.offWhite}
      scroll
      contentStyle={styles.container}
    >
      <StatusBar style="dark" backgroundColor={theme.colors.offWhite} />

      <View style={styles.content}>
        <View style={styles.header}>
          <AppText variant="screenTitle">Settings</AppText>
          <AppText variant="bodySmall" color={theme.colors.muted}>
            Manage your account, app preferences, and support.
          </AppText>
        </View>

        <AppCard style={styles.settingsCard}>
          <View style={styles.profileRow}>
            <View style={styles.avatar}>
              <AppText variant="h3" color={theme.colors.white}>
                {profile.initials}
              </AppText>
            </View>
            <View style={styles.profileCopy}>
              <AppText variant="bodyMedium">{profile.name}</AppText>
              <AppText variant="bodySmall" color={theme.colors.muted}>
                {profile.email}
              </AppText>
              <AppText variant="caption" color={theme.colors.orange}>
                {profile.verificationState}
              </AppText>
            </View>
          </View>

          <View style={styles.fullDivider} />

          <ReferralSettingsCard onPress={() => router.push("/growth/referral")} />

          <View style={styles.fullDivider} />

          <View style={styles.sectionLabel}>
            <AppText variant="monoSmall" color={theme.colors.muted}>
              ACCOUNT
            </AppText>
          </View>
          {renderRows(accountSettings)}

          <View style={styles.sectionLabel}>
            <AppText variant="monoSmall" color={theme.colors.muted}>
              SUPPORT
            </AppText>
            <AppText variant="bodySmall" color={theme.colors.muted}>
              Need help with a ride, payment, or your account?
            </AppText>
          </View>
          {renderRows(supportOptions, { support: true })}

          <View style={styles.fullDivider} />

          <View style={styles.sectionLabel}>
            <AppText variant="monoSmall" color={theme.colors.muted}>
              ACCOUNT ACTIONS
            </AppText>
          </View>
          {renderRows(accountActions)}
        </AppCard>
      </View>
    </AppScreen>
  );
}

function ReferralSettingsCard({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.referralCard,
        pressed ? styles.referralCardPressed : null,
      ]}
    >
      <View style={styles.referralIcon}>
        <MaterialIcons
          color={theme.colors.black}
          name="card-giftcard"
          size={19}
        />
      </View>
      <View style={styles.referralCopy}>
        <AppText variant="bodyMedium">Referral rewards</AppText>
        <AppText variant="bodySmall" color={theme.colors.muted}>
          Share your code and track ride cashback.
        </AppText>
      </View>
      <View style={styles.referralAction}>
        <AppText variant="h3" color={theme.colors.orange}>
          ›
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.xxl,
  },
  content: {
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
  },
  header: {
    gap: theme.spacing.xxs,
  },
  settingsCard: {
    paddingHorizontal: 0,
    paddingVertical: 0,
    overflow: "hidden",
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.md,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: theme.radii.pill,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.orange,
    alignItems: "center",
    justifyContent: "center",
    ...theme.shadows.subtle,
  },
  profileCopy: {
    flex: 1,
    gap: 3,
  },
  referralCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.white,
  },
  referralCardPressed: {
    opacity: 0.75,
  },
  referralIcon: {
    width: 38,
    height: 38,
    borderRadius: theme.radii.sm,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.orangeLight,
    alignItems: "center",
    justifyContent: "center",
    ...theme.shadows.card,
  },
  referralCopy: {
    flex: 1,
    gap: 2,
  },
  referralAction: {
    alignItems: "center",
    justifyContent: "center",
  },
  sectionLabel: {
    gap: 2,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.xxs,
  },
  fullDivider: {
    height: 1,
    backgroundColor: "#E8E4DE",
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.xxs,
    marginBottom: 0,
  },
});
