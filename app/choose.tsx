import { Ionicons } from "@expo/vector-icons";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { AppScreen } from "@/components/app-screen";
import { AppText } from "@/components/app-text";
import { BackArrow } from "@/components/back-arrow";
import { DriveScene } from "@/components/rider/drive-scene";
import { WheelersWordmark } from "@/components/wheelers-wordmark";
import { brand } from "@/constants/brand";
import { isDriverApp, publicEntryRoute, switchAppSide } from "@/lib/app-variant";
import { theme } from "@/theme";

/** Ride or Drive. Riders go on to their phone number; drivers to driver sign-in. */
export default function ChooseScreen() {
  const router = useRouter();
  // "I already have an account": the same two doors, worded for signing in.
  const returning = useLocalSearchParams<{ have?: string }>().have === "1";
  const [switching, setSwitching] = useState(false);

  if (isDriverApp) {
    return <Redirect href={publicEntryRoute} />;
  }

  async function drive() {
    if (switching) return;
    setSwitching(true);
    try {
      // The app restarts on the driver side and opens driver sign-in.
      await switchAppSide("driver");
    } finally {
      setSwitching(false);
    }
  }

  return (
    <AppScreen backgroundColor={brand.cream} contentStyle={styles.content}>
      <BackArrow />

      {/* The wordmark and type of driver sign-in, so nothing changes size on the way there. */}
      <View style={styles.top}>
        <WheelersWordmark ink="black" style={styles.orangeMark} width={180} />
        <AppText style={styles.center} variant="h2">
          {returning ? "Which account is yours?" : "Ride or drive?"}
        </AppText>
      </View>

      {/* Two doors of the same size, each with the car on the move: neither side of the app is the lesser one. */}
      <View style={styles.doors}>
        <Door
          hint={returning ? "Sign in as a rider with your phone number" : "Book a ride and set your own price"}
          dark
          onPress={() => router.push("/rider-phone")}
          subtitle={returning ? "Sign in with your phone number." : "Book a ride at your price."}
          title="Ride"
        />
        <Door
          disabled={switching}
          hint={returning ? "Sign in as a driver with Apple, Google or email" : "Earn money driving with Wheelers"}
          onPress={() => void drive()}
          subtitle={returning ? "Sign in with Apple, Google or email." : "Earn on your schedule."}
          title="Drive"
        />
      </View>
    </AppScreen>
  );
}

function Door({
  title,
  subtitle,
  hint,
  dark,
  disabled,
  onPress,
}: {
  title: string;
  subtitle: string;
  hint: string;
  /** The ink door (Ride); the other is the white one (Drive). */
  dark?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityHint={hint}
      accessibilityLabel={title}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.door, dark ? styles.doorDark : null, pressed && styles.pressed, disabled && styles.disabled]}>
      <View style={styles.doorTop}>
        <View style={styles.doorWords}>
          <AppText color={dark ? theme.colors.orange : brand.ink} variant="h2">
            {title}
          </AppText>
          <AppText color={dark ? "#CFC6B8" : brand.muted} variant="bodySmall">
            {subtitle}
          </AppText>
        </View>
        <View style={[styles.arrow, dark ? styles.arrowDark : null]}>
          <Ionicons color={brand.ink} name="arrow-forward" size={22} />
        </View>
      </View>
      <DriveScene
        dash={dark ? "#3A3A3A" : brand.hairline}
        ground="transparent"
        height={96}
        showSkyline={false}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // The clean black artwork inked orange: the orange file's edges are rough at this size.
  orangeMark: { tintColor: theme.colors.orange },
  content: { paddingTop: theme.spacing.lg, gap: theme.spacing.xl },
  top: { alignItems: "center", gap: theme.spacing.lg, paddingTop: theme.spacing.lg },
  center: { textAlign: "center" },
  doors: { flex: 1, gap: theme.spacing.md, paddingBottom: theme.spacing.lg },
  door: {
    flex: 1,
    justifyContent: "space-between",
    paddingTop: theme.spacing.lg,
    borderWidth: theme.borders.thick,
    borderColor: brand.ink,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.white,
    overflow: "hidden",
  },
  doorDark: { backgroundColor: brand.ink },
  doorTop: { flexDirection: "row", alignItems: "flex-start", gap: theme.spacing.md, paddingHorizontal: theme.spacing.lg },
  doorWords: { flex: 1, gap: 4 },
  arrow: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: theme.borders.thick,
    borderColor: brand.ink,
    borderRadius: 23,
    backgroundColor: theme.colors.white,
  },
  arrowDark: { backgroundColor: theme.colors.orange, borderColor: theme.colors.orange },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.6 },
});
