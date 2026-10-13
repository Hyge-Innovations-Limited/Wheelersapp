import { Redirect, useFocusEffect, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeInDown, ZoomIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText } from "@/components/app-text";
import { DriveScene } from "@/components/rider/drive-scene";
import { PriceTalk } from "@/components/rider/scene-extras";
import { WheelersWordmark } from "@/components/wheelers-wordmark";
import { brand } from "@/constants/brand";
import { isDriverApp, publicEntryRoute, takeEntryRoute } from "@/lib/app-variant";
import { readPendingCode } from "@/lib/rider-sign-in-state";
import { theme } from "@/theme";

/** The first thing a signed-out person sees: the mark, the name, a car on the move. */
export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Read once: a change of side may have asked for a particular screen to open on.
  const [entry] = useState(takeEntryRoute);

  // A code was sent and they left to read it: straight back to typing it.
  useEffect(() => {
    if (isDriverApp) return;
    let live = true;
    void readPendingCode().then((pending) => {
      if (!live || !pending) return;
      router.push({
        pathname: "/rider-code",
        params: { phone: pending.phone, sentAt: String(pending.sentAt) },
      });
    });
    return () => {
      live = false;
    };
  }, [router]);

  // The car carries the person on: it drives off, and the next screen's cars
  // drive in, so the two screens read as one road. Back here, it is waiting.
  const [leaving, setLeaving] = useState(false);
  const going = useRef<ReturnType<typeof setTimeout> | null>(null);
  useFocusEffect(
    useCallback(() => {
      setLeaving(false);
      return () => {
        if (going.current) clearTimeout(going.current);
        going.current = null;
      };
    }, []),
  );

  function go(returning: boolean) {
    if (going.current) return;
    setLeaving(true);
    going.current = setTimeout(() => {
      going.current = null;
      router.push(returning ? { pathname: "/choose", params: { have: "1" } } : "/choose");
    }, 330);
  }

  if (isDriverApp) {
    return <Redirect href={publicEntryRoute} />;
  }

  // Sent here by "I want to ride instead": straight on to the rider's sign-in.
  if (entry === "/rider-phone") {
    return <Redirect href="/rider-phone" />;
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      {/* The same wordmark, size and type as driver sign-in, so the app reads as one from the first screen. */}
      <View style={[styles.top, { paddingTop: insets.top + 80 }]}>
        <Animated.View entering={ZoomIn.duration(400)}>
          <WheelersWordmark ink="black" style={styles.orangeMark} width={224} />
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(100).duration(400)}>
          <AppText color={brand.muted} style={styles.tagline} variant="body">
            Ride or drive. Your price.
          </AppText>
        </Animated.View>
      </View>

      {/* What Wheelers is, shown before a word is read: a price named, a driver taking it. */}
      <DriveScene height={270} leaving={leaving}>
        <PriceTalk bottom={132} />
      </DriveScene>

      <Animated.View
        entering={FadeInDown.delay(250).duration(400)}
        style={[styles.actions, { paddingBottom: Math.max(insets.bottom, 12) + theme.spacing.lg }]}>
        <Pressable
          accessibilityRole="button"
          onPress={() => go(false)}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
          <AppText color={brand.ink} variant="label">
            Get started
          </AppText>
        </Pressable>
        {/* Riders and drivers both have accounts, so this asks which one too. */}
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => go(true)}
          style={({ pressed }) => [styles.haveRow, pressed && styles.havePressed]}>
          <AppText color="#CFC6B8" variant="bodySmall">
            {"Already have an account? "}
          </AppText>
          <AppText color={theme.colors.orange} variant="label">
            Sign in
          </AppText>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // The clean black artwork inked orange: the orange file's edges are rough at this size.
  orangeMark: { tintColor: theme.colors.orange },
  screen: { flex: 1, backgroundColor: brand.cream },
  top: { flex: 1, alignItems: "center", gap: theme.spacing.lg, paddingHorizontal: theme.spacing.xl },
  tagline: { textAlign: "center" },
  actions: {
    backgroundColor: brand.ink,
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.lg,
    gap: theme.spacing.lg,
  },
  button: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
    width: "100%",
    borderWidth: theme.borders.thick,
    borderColor: brand.cream,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.orange,
  },
  pressed: { opacity: 0.85 },
  haveRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", minHeight: 32 },
  havePressed: { opacity: 0.6 },
});
