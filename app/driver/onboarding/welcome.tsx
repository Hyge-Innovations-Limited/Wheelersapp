import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";

import { AppButton } from "@/components/app-button";
import { AppScreen } from "@/components/app-screen";
import { AppText } from "@/components/app-text";
import { FlowHeader } from "@/components/flow-header";
import { OnboardingSignOut } from "@/components/onboarding-sign-out";
import { useResponsive } from "@/lib/responsive";
import { theme } from "@/theme";
import { useDriverOnboarding } from "@/lib/driver-onboarding";

const STEPS = [
  { icon: "id-card-outline" as const, label: "NIN card photo" },
  { icon: "car-outline" as const, label: "Driver's licence (photo or PDF)" },
  { icon: "camera-outline" as const, label: "Face verification" },
  { icon: "speedometer-outline" as const, label: "Vehicle details" },
  { icon: "images-outline" as const, label: "Vehicle photos (7-10)" },
];

export default function OnboardingWelcomeScreen() {
  const router = useRouter();
  const responsive = useResponsive();
  const { startFull } = useDriverOnboarding();

  // Five rows plus a header have to clear the button on a 320x568 phone —
  // tighten the rhythm there instead of pushing the CTA off-screen.
  const iconSize = responsive.scale(44);

  return (
    <AppScreen scroll contentStyle={styles.container}>
      <FlowHeader
        title="Let's get you verified"
        subtitle="To start earning, we need a few things from you"
        progress={{ count: 6, active: 0 }}
      />

      <Animated.View
        entering={FadeInDown.delay(150).duration(400)}
        style={[
          styles.steps,
          {
            marginTop: responsive.isShort ? theme.spacing.lg : theme.spacing.xxl,
            gap: responsive.isShort ? theme.spacing.md : theme.spacing.lg,
          },
        ]}>
        {STEPS.map((step) => (
          <View key={step.label} style={styles.stepRow}>
            <View style={[styles.stepIcon, { width: iconSize, height: iconSize }]}>
              <Ionicons name={step.icon} size={responsive.scale(22)} color={theme.colors.orange} />
            </View>
            <AppText variant="bodyMedium" numberOfLines={2}>{step.label}</AppText>
          </View>
        ))}
      </Animated.View>

      <View style={styles.spacer} />

      <AppButton
        title="Let's go"
        onPress={() => {
          startFull();
          router.push("/driver/onboarding/nin-upload");
        }}
      />
      <OnboardingSignOut />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: theme.spacing.xxxl,
  },
  steps: {
    width: "100%",
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
  },
  stepIcon: {
    flexShrink: 0,
    borderRadius: theme.radius.sm,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.orangeLight,
    alignItems: "center",
    justifyContent: "center",
    ...theme.shadows.subtle,
  },
  spacer: {
    // flexGrow, not flex: inside a ScrollView's content container `flex: 1`
    // collapses the spacer instead of pushing the button to the bottom.
    flexGrow: 1,
    minHeight: theme.spacing.xxl,
  },
});
