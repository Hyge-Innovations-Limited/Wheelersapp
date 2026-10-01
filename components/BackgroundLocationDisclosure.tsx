import { Ionicons } from "@expo/vector-icons";
import { Modal, Platform, ScrollView, StyleSheet, View } from "react-native";

import { AppButton } from "@/components/app-button";
import { AppText } from "@/components/app-text";
import { isDriverApp } from "@/lib/app-variant";
import { useAppTheme } from "@/lib/theme-context";
import { theme } from "@/theme";

type BackgroundLocationDisclosureProps = {
  visible: boolean;
  onAccept: () => void;
  onDecline: () => void;
  /**
   * Which OS prompt this disclosure precedes. Play policy wants a disclosure
   * immediately before EVERY location permission prompt — the foreground one
   * included, which used to fire cold on first launch (rejection: "requests
   * ... not immediately preceded by an in-app disclosure").
   */
  scope?: "foreground" | "background";
};

/**
 * Google Play "Prominent Disclosure & Consent" screen for
 * ACCESS_BACKGROUND_LOCATION.
 *
 * Play policy requires that, BEFORE the OS runtime prompt, the app itself
 * explains (1) what data is collected, (2) why, and (3) that it is collected
 * even when the app is closed or not in use — and that the user takes an
 * explicit affirmative action to continue. This modal is that disclosure.
 * It cannot be dismissed by tapping outside or with the hardware back button;
 * the user has to pick "Allow" or "Not now".
 */
export function BackgroundLocationDisclosure({
  visible,
  onAccept,
  onDecline,
  scope = "background",
}: BackgroundLocationDisclosureProps) {
  const { isDark } = useAppTheme();

  const surface = isDark ? theme.colors.darkSurface : theme.colors.white;
  const border = isDark ? theme.colors.darkBorder : theme.colors.black;
  const muted = isDark ? theme.colors.darkMuted : theme.colors.muted;

  const foreground = scope === "foreground";

  const foregroundBullets: { icon: keyof typeof Ionicons.glyphMap; text: string }[] = isDriverApp
    ? [
        {
          icon: "people-outline",
          text: "Show you ride requests from riders near your current position.",
        },
        {
          icon: "navigate-outline",
          text: "Place you on the map and power turn-by-turn trip navigation.",
        },
        {
          icon: "time-outline",
          text: "Only while you are using the app. Background use is asked separately, and only if you go online.",
        },
      ]
    : [
        {
          icon: "location-outline",
          text: "Set your pickup point and show drivers available near you.",
        },
        {
          icon: "navigate-outline",
          text: "Track your trip and keep your ETA accurate while you ride.",
        },
        {
          icon: "time-outline",
          text: "Only while you are using the app.",
        },
      ];

  const backgroundBullets: { icon: keyof typeof Ionicons.glyphMap; text: string }[] = isDriverApp
    ? [
        {
          icon: "people-outline",
          text: "Match you with nearby ride requests while you are online, even if you switch apps or lock your phone.",
        },
        {
          icon: "navigate-outline",
          text: "Show riders your live position and keep trip progress accurate during a ride.",
        },
        {
          icon: "time-outline",
          text: "Only while you are online. Tracking stops as soon as you go offline.",
        },
      ]
    : [
        {
          icon: "navigate-outline",
          text: "Keep your live trip progress and ETA accurate for you and your driver.",
        },
        {
          icon: "shield-checkmark-outline",
          text: "Power safety tools like trip sharing and emergency alerts while you are on the road.",
        },
        {
          icon: "time-outline",
          text: "Only while a ride is active. Tracking stops when the trip ends or is cancelled.",
        },
      ];

  const bullets = foreground ? foregroundBullets : backgroundBullets;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      // Hardware back must not silently dismiss the disclosure — an explicit
      // choice is required by the policy. Treat back as "Not now". (iOS has no
      // back, and no "Not now": see the buttons below.)
      onRequestClose={Platform.OS === "ios" ? onAccept : onDecline}
    >
      <View style={styles.backdrop}>
        <View
          style={[styles.card, { backgroundColor: surface, borderColor: border }]}
          accessibilityViewIsModal
        >
          <View style={styles.iconWrap}>
            <Ionicons name="location" size={28} color={theme.colors.offWhite} />
          </View>

          <AppText variant="h2" style={styles.title}>
            {foreground
              ? isDriverApp
                ? "Wheelers Driver uses your location"
                : "Wheelers uses your location"
              : isDriverApp
                ? "Wheelers Driver uses your location in the background"
                : "Wheelers uses your location in the background"}
          </AppText>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <AppText variant="body" style={styles.lead}>
              {foreground ? (
                isDriverApp
                  ? "Wheelers Driver collects location data to show you nearby ride requests, place you on the map, and enable trip navigation while you are using the app. Your location is never sold or shared for advertising."
                  : "Wheelers collects location data to set your pickup point, show nearby drivers, and track your trip while you are using the app. Your location is never sold or shared for advertising."
              ) : (
                <>
                  {isDriverApp
                    ? "Wheelers Driver collects location data to match you with nearby ride requests and show riders your live position while you are online, "
                    : "Wheelers collects location data to enable live trip tracking and safety monitoring during your ride, "}
                  <AppText variant="bodyMedium">
                    even when the app is closed or not in use.
                  </AppText>
                </>
              )}
            </AppText>

            <View style={styles.bullets}>
              {bullets.map((item) => (
                <View key={item.icon} style={styles.bulletRow}>
                  <View
                    style={[
                      styles.bulletIcon,
                      { borderColor: border, backgroundColor: theme.colors.orangeLight },
                    ]}
                  >
                    <Ionicons name={item.icon} size={16} color={theme.colors.orange} />
                  </View>
                  <AppText variant="bodySmall" style={styles.bulletText}>
                    {item.text}
                  </AppText>
                </View>
              ))}
            </View>

            <AppText variant="caption" color={muted} style={styles.footnote}>
              {foreground
                ? 'Choose "While using the app" on the next prompt. You can change this anytime in Settings.'
                : Platform.OS === "android"
                  ? 'On the next screen choose "Allow all the time" so tracking keeps working if you switch apps or lock your phone. You can change this anytime in Settings.'
                  : 'On the next prompt choose "Always Allow" so tracking keeps working if you switch apps or lock your phone. You can change this anytime in Settings.'}
            </AppText>
          </ScrollView>

          <View style={styles.actions}>
            <AppButton
              title={foreground ? "Continue" : "Allow background location"}
              onPress={onAccept}
            />
            {/* Apple (App Review 5.1.1(iv)): a screen before the permission
                prompt must always lead to it — the choice is made in Apple's
                prompt, not here. Google's prominent disclosure wants a way to
                decline: Android keeps "Not now". */}
            {Platform.OS === "ios" ? null : (
              <AppButton title="Not now" variant="ghost" onPress={onDecline} />
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(13, 13, 13, 0.88)",
    justifyContent: "center",
    paddingHorizontal: theme.spacing.gutter,
  },
  card: {
    borderWidth: theme.borders.thick,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.xl,
    maxHeight: "88%",
    ...theme.shadows.card,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.orange,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: theme.spacing.lg,
  },
  title: {
    marginBottom: theme.spacing.md,
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    gap: theme.spacing.lg,
  },
  lead: {},
  bullets: {
    gap: theme.spacing.md,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing.md,
  },
  bulletIcon: {
    width: 30,
    height: 30,
    borderRadius: theme.radius.xs,
    borderWidth: theme.borders.regular,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  bulletText: {
    flex: 1,
  },
  footnote: {},
  actions: {
    gap: theme.spacing.md,
    marginTop: theme.spacing.xl,
  },
});
