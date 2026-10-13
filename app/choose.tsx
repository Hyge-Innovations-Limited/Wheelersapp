import { Ionicons } from "@expo/vector-icons";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { AppScreen } from "@/components/app-screen";
import { AppText } from "@/components/app-text";
import { BackArrow } from "@/components/back-arrow";
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
        <WheelersWordmark ink="black" width={160} />
        <AppText style={styles.center} variant="h2">
          {returning ? "Which account is yours?" : "Ride or drive?"}
        </AppText>
      </View>

      {/* Two doors of the same size: neither side of the app is the lesser one. */}
      <View style={styles.doors}>
        <Door
          hint={returning ? "Sign in as a rider with your phone number" : "Book a ride and set your own price"}
          icon="car-sport-outline"
          onPress={() => router.push("/rider-phone")}
          subtitle={returning ? "Sign in with your phone number." : "Book a ride at your price."}
          title="Ride"
        />
        <Door
          disabled={switching}
          hint={returning ? "Sign in as a driver with Apple, Google or email" : "Earn money driving with Wheelers"}
          icon="speedometer-outline"
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
  icon,
  disabled,
  onPress,
}: {
  title: string;
  subtitle: string;
  hint: string;
  icon: keyof typeof Ionicons.glyphMap;
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
      style={({ pressed }) => [styles.door, pressed && styles.pressed, disabled && styles.disabled]}>
      <View style={styles.doorIcon}>
        <Ionicons color={brand.ink} name={icon} size={26} />
      </View>
      <View style={styles.doorWords}>
        <AppText variant="h3">{title}</AppText>
        <AppText color={brand.muted} variant="bodySmall">
          {subtitle}
        </AppText>
      </View>
      <Ionicons color={brand.ink} name="arrow-forward" size={22} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: theme.spacing.lg, gap: theme.spacing.xl },
  top: { alignItems: "center", gap: theme.spacing.lg, paddingTop: theme.spacing.lg },
  center: { textAlign: "center" },
  doors: { gap: theme.spacing.md },
  door: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    minHeight: 96,
    padding: theme.spacing.lg,
    borderWidth: theme.borders.thick,
    borderColor: brand.ink,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.white,
    ...theme.shadows.card,
  },
  doorIcon: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: theme.borders.thick,
    borderColor: brand.ink,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.orange,
  },
  doorWords: { flex: 1, gap: 2 },
  pressed: { transform: [{ translateX: 2 }, { translateY: 2 }], shadowOpacity: 0, elevation: 0 },
  disabled: { opacity: 0.6 },
});
