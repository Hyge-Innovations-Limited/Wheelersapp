import { Redirect, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, View } from "react-native";
import Animated, { ZoomIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BrandLogo } from "@/components/brand-logo";
import { DriveScene } from "@/components/rider/drive-scene";
import { RButton, RLink, RText, rider } from "@/components/rider/kit";
import { isDriverApp, publicEntryRoute } from "@/lib/app-variant";

/** The first thing a signed-out person sees: the mark, the name, a car on the move. */
export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  if (isDriverApp) {
    return <Redirect href={publicEntryRoute} />;
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <View style={[styles.brand, { paddingTop: insets.top + 24 }]}>
        <Animated.View entering={ZoomIn.duration(600)}>
          <BrandLogo size={120} />
        </Animated.View>
        <RText variant="display" style={styles.name}>
          Wheelers
        </RText>
        <RText color={rider.colors.muted} style={styles.tagline}>
          Your ride. Your price.
        </RText>
      </View>

      <DriveScene height={210} />

      <View style={[styles.actions, { paddingBottom: Math.max(insets.bottom, 12) + 12 }]}>
        <RButton onPress={() => router.push("/choose")} title="Get started" />
        <RLink
          color={rider.colors.cream}
          onPress={() => router.push("/rider-phone")}
          title="I already have an account"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: rider.colors.cream },
  brand: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 24 },
  name: { fontSize: 46, lineHeight: 50 },
  tagline: { fontFamily: rider.fonts.semibold, fontSize: 18 },
  actions: { backgroundColor: rider.colors.ink, paddingHorizontal: 24, paddingTop: 20, gap: 4 },
});
