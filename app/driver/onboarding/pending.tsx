import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown, ZoomIn } from "react-native-reanimated";

import { AppScreen } from "@/components/app-screen";
import { AppText } from "@/components/app-text";
import { AppButton } from "@/components/app-button";
import { useResponsive } from "@/lib/responsive";
import { theme } from "@/theme";
import { useAuth } from "@/lib/auth";
import { noteDriverKyc } from "@/lib/driver-kyc";
import { knownDriverKyc } from "@/lib/driver-kyc-store";
import { getDriverKycStatus, type DriverKycStatusResponse } from "@/lib/api";
import { useDriverOnboarding } from "@/lib/driver-onboarding";
import { KYC_STEP_LABELS, KYC_STEP_ROUTES, KYC_STEPS, fixStepsFrom } from "@/lib/kyc-steps";
import { OnboardingSignOut } from "@/components/onboarding-sign-out";
import { getAccessTokenWithRetry } from "@/lib/access-token";

export default function PendingScreen() {
  const router = useRouter();
  const { getAccessToken } = useAuth();
  const responsive = useResponsive();
  const { startFix } = useDriverOnboarding();
  // Start from the last known answer, so a rejected driver doesn't first see "Under review".
  const [kycStatus, setKycStatus] = useState<string>(() => knownDriverKyc() ?? "SUBMITTED");
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  const [rejectedFields, setRejectedFields] = useState<string[]>([]);
  const [fieldReasons, setFieldReasons] = useState<Record<string, string>>({});
  const [submission, setSubmission] = useState<DriverKycStatusResponse["submission"]>(null);

  useEffect(() => {
    let active = true;

    async function checkStatus() {
      try {
        const token = await getAccessTokenWithRetry(getAccessToken);
        if (!token || !active) return;
        const result = await getDriverKycStatus({ accessToken: token });
        if (!active) return;
        // Tell the driver lock too: it keeps them here until this says APPROVED.
        noteDriverKyc(result.kycStatus);
        setKycStatus(result.kycStatus);
        setRejectionReason(result.submission?.rejectionReason ?? null);
        setRejectedFields(result.submission?.rejectedFields ?? []);
        setFieldReasons(result.submission?.fieldReasons ?? {});
        setSubmission(result.submission);
      } catch {
        // silently retry on next interval
      }
    }

    checkStatus();
    const interval = setInterval(checkStatus, 10_000);
    return () => { active = false; clearInterval(interval); };
  }, []);

  useEffect(() => {
    if (kycStatus === "APPROVED") {
      const timer = setTimeout(() => router.replace("/driver/(tabs)/home" as any), 2000);
      return () => clearTimeout(timer);
    }
  }, [kycStatus]);

  // One icon box and one centre block, sized once for every branch below.
  const iconSize = responsive.scale(96);
  const iconStyle = { width: iconSize, height: iconSize };
  const glyphSize = responsive.scale(48);
  const centerStyle = { gap: responsive.isShort ? theme.spacing.lg : theme.spacing.xl };

  if (kycStatus === "APPROVED") {
    return (
      <AppScreen scroll contentStyle={styles.container}>
        <View style={[styles.center, centerStyle]}>
          <Animated.View entering={ZoomIn.duration(400)} style={[styles.iconWrap, iconStyle, styles.approvedIcon]}>
            <Ionicons name="checkmark-circle" size={glyphSize} color={theme.colors.green} />
          </Animated.View>
          <Animated.View entering={FadeInDown.delay(150).duration(400)} style={styles.textWrap}>
            <AppText variant="h1" style={styles.title} numberOfLines={2}>You're Approved!</AppText>
            <AppText variant="body" color={theme.colors.muted} style={styles.subtitle}>
              Your account is active. Taking you to the dashboard...
            </AppText>
          </Animated.View>
        </View>
        <AppButton title="Go to Dashboard" onPress={() => router.replace("/driver/(tabs)/home" as any)} />
      </AppScreen>
    );
  }

  if (kycStatus === "REJECTED") {
    // Only what was sent back; everything else stays approved.
    const toFix = fixStepsFrom(rejectedFields);
    const everything = toFix.length === KYC_STEPS.length;
    const startFixing = () => {
      startFix(toFix, submission ? {
        make: submission.vehicleMake ?? undefined,
        model: submission.vehicleModel ?? undefined,
        plate: submission.vehiclePlate ?? undefined,
        year: submission.vehicleYear ?? undefined,
      } : null);
      router.push(KYC_STEP_ROUTES[toFix[0]!] as any);
    };

    return (
      <AppScreen scroll contentStyle={styles.container}>
        <View style={[styles.center, centerStyle]}>
          <Animated.View entering={ZoomIn.duration(400)} style={[styles.iconWrap, iconStyle, styles.rejectedIcon]}>
            <Ionicons name="alert-circle" size={glyphSize} color={theme.colors.danger} />
          </Animated.View>
          <Animated.View entering={FadeInDown.delay(150).duration(400)} style={styles.textWrap}>
            <AppText variant="h1" style={styles.title} numberOfLines={2}>
              {toFix.length === 1 ? "One thing to fix" : everything ? "Please send your documents again" : "A few things to fix"}
            </AppText>
            <AppText variant="body" color={theme.colors.muted} style={styles.subtitle}>
              {everything
                ? rejectionReason ?? "Your documents did not pass review."
                : "Everything else is approved. Fix this and we'll look again, usually within a few hours."}
            </AppText>
          </Animated.View>

          {!everything && (
            <Animated.View
              entering={FadeInDown.delay(250).duration(400)}
              style={[styles.rejectedList, { padding: responsive.scale(16) }]}>
              {toFix.map((field) => (
                <View key={field} style={styles.rejectedItem}>
                  <Ionicons name="alert-circle" size={responsive.scale(16)} color={theme.colors.danger} />
                  <View style={styles.rejectedText}>
                    <AppText variant="label" numberOfLines={1}>
                      {KYC_STEP_LABELS[field]}
                    </AppText>
                    {fieldReasons[field] ? (
                      <AppText variant="bodySmall" color={theme.colors.muted}>
                        {fieldReasons[field]}
                      </AppText>
                    ) : null}
                  </View>
                </View>
              ))}
            </Animated.View>
          )}
        </View>
        <AppButton
          title={toFix.length === 1 ? `Fix ${KYC_STEP_LABELS[toFix[0]!].toLowerCase()}` : everything ? "Start again" : `Fix ${toFix.length} items`}
          onPress={startFixing}
        />
        <OnboardingSignOut />
      </AppScreen>
    );
  }

  // Default: SUBMITTED / PENDING
  return (
    <AppScreen scroll contentStyle={styles.container}>
      <View style={[styles.center, centerStyle]}>
        <Animated.View entering={ZoomIn.duration(400)} style={[styles.iconWrap, iconStyle]}>
          <Ionicons name="time-outline" size={glyphSize} color={theme.colors.orange} />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(150).duration(400)} style={styles.textWrap}>
          <AppText variant="h1" style={styles.title} numberOfLines={2}>
            Under Review
          </AppText>
          <AppText variant="body" color={theme.colors.muted} style={styles.subtitle}>
            Your application is being reviewed. We'll notify you once approved — usually within 24 hours.
          </AppText>
        </Animated.View>
      </View>

      <Animated.View
        entering={FadeInDown.delay(300).duration(400)}
        style={[
          styles.infoCard,
          {
            marginTop: responsive.isShort ? theme.spacing.xl : theme.spacing.xxxl,
            padding: responsive.scale(16),
          },
        ]}>
        <View style={styles.infoRow}>
          <Ionicons name="notifications-outline" size={responsive.scale(18)} color={theme.colors.orange} />
          <AppText variant="bodySmall" color={theme.colors.muted} style={styles.infoText}>
            You'll receive a push notification when approved
          </AppText>
        </View>
        <View style={styles.infoRow}>
          <Ionicons name="shield-checkmark-outline" size={responsive.scale(18)} color={theme.colors.orange} />
          <AppText variant="bodySmall" color={theme.colors.muted} style={styles.infoText}>
            Your documents are stored securely
          </AppText>
        </View>
      </Animated.View>
      <OnboardingSignOut />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    // flexGrow keeps the block centred on a tall screen while still letting
    // the rejected-with-a-long-list case scroll on a short one.
    flexGrow: 1,
    justifyContent: "center",
  },
  center: {
    alignItems: "center",
  },
  iconWrap: {
    flexShrink: 0,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.orangeLight,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.orange,
    alignItems: "center",
    justifyContent: "center",
  },
  approvedIcon: {
    borderColor: theme.colors.green,
    backgroundColor: theme.colors.successLight,
  },
  rejectedIcon: {
    borderColor: theme.colors.danger,
    backgroundColor: theme.colors.dangerLight,
  },
  textWrap: {
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  title: {
    textAlign: "center",
  },
  subtitle: {
    textAlign: "center",
    // Percentage rather than a fixed 280pt so the measure stays comfortable
    // on a 320pt phone and on a tablet alike.
    maxWidth: "88%",
    lineHeight: 20,
  },
  infoCard: {
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    borderRadius: theme.radius.md,
    gap: theme.spacing.md,
    backgroundColor: theme.colors.white,
    ...theme.shadows.subtle,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
  },
  infoText: {
    flex: 1,
    minWidth: 0,
  },
  rejectedList: {
    width: "100%",
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.danger,
    borderRadius: theme.radius.md,
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.dangerLight,
    ...theme.shadows.subtle,
  },
  rejectedItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing.sm,
  },
  rejectedText: {
    flex: 1,
    gap: 2,
  },
});
