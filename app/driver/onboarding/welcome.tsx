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
import { draftHasProgress, firstUnfinishedStep } from "@/lib/driver-onboarding-draft";
import { KYC_STEPS, KYC_STEP_LABELS, KYC_STEP_ROUTES } from "@/lib/kyc-steps";

const STEPS = [
  { icon: "id-card-outline" as const, label: "NIN card photo" },
  { icon: "car-outline" as const, label: "Driver's licence (photo or PDF)" },
  { icon: "person-outline" as const, label: "Your name and licence number" },
  { icon: "camera-outline" as const, label: "Face verification" },
  { icon: "speedometer-outline" as const, label: "Vehicle details" },
  { icon: "call-outline" as const, label: "Your phone number (we text you a code)" },
  { icon: "images-outline" as const, label: "Vehicle photos (7-10)" },
];

export default function OnboardingWelcomeScreen() {
  const router = useRouter();
  const responsive = useResponsive();
  const { data, restored, startFull } = useDriverOnboarding();
  // Something was filled in before the app was closed: carry on from the first step still to do.
  const resumeAt = restored && draftHasProgress(data) ? firstUnfinishedStep(data, KYC_STEPS) ?? "vehiclePhotos" : null;

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

      {resumeAt ? (
        <AppText variant="bodySmall" color={theme.colors.muted} style={styles.resumeNote}>
          {`We kept what you added. Next: ${KYC_STEP_LABELS[resumeAt]}.`}
        </AppText>
      ) : null}
      <AppButton
        title={resumeAt ? "Continue where you stopped" : "Let's go"}
        onPress={() => {
          startFull();
          router.push(resumeAt ? KYC_STEP_ROUTES[resumeAt] : "/driver/onboarding/nin-upload");
        }}
      />
      <OnboardingSignOut />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  resumeNote: { textAlign: "center", marginBottom: theme.spacing.sm },
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
    borderColor: theme.colors.borderLight,
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
