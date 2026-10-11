import { Ionicons } from "@expo/vector-icons";
import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { BrandLogo } from "@/components/brand-logo";
import { DriveScene } from "@/components/rider/drive-scene";
import { RScreen, RText, rider } from "@/components/rider/kit";
import { isDriverApp, publicEntryRoute, switchAppSide } from "@/lib/app-variant";

/** Ride or Drive. Riders go on to their phone number; drivers to driver sign-in. */
export default function ChooseScreen() {
  const router = useRouter();
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
    <RScreen contentStyle={styles.content}>
      <View style={styles.brand}>
        <BrandLogo size={52} />
        <View>
          <RText variant="heading">Wheelers</RText>
          <RText color={rider.colors.muted} variant="smallBold">
            Your ride. Your price.
          </RText>
        </View>
      </View>

      <View style={styles.intro}>
        <RText variant="display" style={styles.headline}>
          How would you like to use Wheelers?
        </RText>
        <RText color={rider.colors.muted}>You can switch at any time from your profile.</RText>
      </View>

      <Pressable
        accessibilityHint="Book a ride and set your own price"
        accessibilityLabel="Ride"
        accessibilityRole="button"
        onPress={() => router.push("/rider-phone")}
        style={({ pressed }) => [styles.ride, pressed ? styles.pressed : null]}>
        <View style={styles.cardTop}>
          <View style={styles.cardWords}>
            <RText color={rider.colors.orange} variant="display">
              Ride
            </RText>
            <RText color={rider.colors.onInkSoft}>Book a ride and set your own price.</RText>
          </View>
          <View style={[styles.arrow, styles.arrowOrange]}>
            <Ionicons color={rider.colors.ink} name="arrow-forward" size={22} />
          </View>
        </View>
        <DriveScene dash={rider.colors.inkLine} ground="transparent" height={110} showSkyline={false} />
      </Pressable>

      <Pressable
        accessibilityHint="Earn money driving with Wheelers"
        accessibilityLabel="Drive"
        accessibilityRole="button"
        disabled={switching}
        onPress={() => void drive()}
        style={({ pressed }) => [styles.drive, pressed || switching ? styles.pressed : null]}>
        <View style={styles.cardWords}>
          <RText variant="title">Drive</RText>
          <RText color={rider.colors.muted} variant="small">
            Earn money driving with Wheelers.
          </RText>
        </View>
        <View style={[styles.arrow, styles.arrowOutline]}>
          <Ionicons color={rider.colors.ink} name="arrow-forward" size={22} />
        </View>
      </Pressable>
    </RScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 16, gap: 20 },
  brand: { flexDirection: "row", alignItems: "center", gap: 12 },
  intro: { gap: 6, paddingTop: 8 },
  headline: { fontSize: 34, lineHeight: 36 },
  ride: {
    flex: 1,
    minHeight: 250,
    justifyContent: "space-between",
    padding: 22,
    paddingBottom: 0,
    borderRadius: 26,
    backgroundColor: rider.colors.ink,
    overflow: "hidden",
  },
  drive: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    padding: 22,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: rider.colors.ink,
    backgroundColor: rider.colors.card,
  },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  cardWords: { flex: 1, gap: 4 },
  arrow: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  arrowOrange: { backgroundColor: rider.colors.orange },
  arrowOutline: { borderWidth: 2, borderColor: rider.colors.ink },
  pressed: { opacity: 0.8 },
});
