import { Ionicons } from "@expo/vector-icons";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { AppScreen } from "@/components/app-screen";
import { AppText, OnLight } from "@/components/app-text";
import { BackArrow } from "@/components/back-arrow";
import { DriveScene } from "@/components/rider/drive-scene";
import { EarningCoins, PickupPin } from "@/components/rider/scene-extras";
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

      {/* Two doors of the same size, each showing what is behind it: on Ride the
          car comes to where you are waiting; on Drive the car is earning. The
          cars drive in as the one on Welcome drives off: one road, two screens. */}
      <View style={styles.doors}>
        <Door
          hint={returning ? "Sign in as a rider with your phone number" : "Book a ride and set your own price"}
          dark
          onPress={() => router.push("/rider-phone")}
          order={0}
          subtitle={returning ? "Sign in with your phone number." : "Name your price. A driver comes to you."}
          title="Ride"
        />
        <Door
          disabled={switching}
          hint={returning ? "Sign in as a driver with Apple, Google or email" : "Earn money driving with Wheelers"}
          onPress={() => void drive()}
          order={1}
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
  order,
  disabled,
  onPress,
}: {
  title: string;
  subtitle: string;
  hint: string;
  /** The ink door (Ride); the other is the white one (Drive). */
  dark?: boolean;
  /** 0 for the first door, 1 for the second: they arrive one after the other. */
  order: number;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Animated.View entering={FadeInDown.delay(80 + order * 120).duration(380)} style={styles.doorWrap}>
      <Pressable
        accessibilityHint={hint}
        accessibilityLabel={title}
        accessibilityRole="button"
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [styles.door, dark ? styles.doorDark : null, pressed && styles.pressed, disabled && styles.disabled]}>
        <OnLight>
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
            <OnLight>
            <Ionicons color={brand.ink} name="arrow-forward" size={22} />
            </OnLight>
          </View>
        </View>
        <DriveScene
          arrive
          arriveDelay={200 + order * 160}
          dash={dark ? "#3A3A3A" : brand.hairline}
          ground="transparent"
          height={190}
          showSkyline={false}>
          {dark ? <PickupPin bottom={30} right={14} /> : <EarningCoins bottom={106} />}
        </DriveScene>
        </OnLight>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // The clean black artwork inked orange: the orange file's edges are rough at this size.
  orangeMark: { tintColor: theme.colors.orange },
  content: { paddingTop: theme.spacing.lg, gap: theme.spacing.xl },
  top: { alignItems: "center", gap: theme.spacing.lg, paddingTop: theme.spacing.lg },
  center: { textAlign: "center" },
  doors: { flex: 1, gap: theme.spacing.md, paddingBottom: theme.spacing.lg },
  doorWrap: { flex: 1 },
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
  pressed: { opacity: 0.9, transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.6 },
});
