import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { AppBadge } from "@/components/app-badge";
import { AppButton } from "@/components/app-button";
import { AppCard } from "@/components/app-card";
import { AppScreen } from "@/components/app-screen";
import { AppText, OnLight } from "@/components/app-text";
import { GearOutline } from "@/components/decorative-shapes";
import { FlowHeader } from "@/components/flow-header";
import { kycSteps } from "@/data/mock";
import { theme } from "@/theme";

export default function KycScreen() {
  const router = useRouter();
  const scanY = useSharedValue(0);

  useEffect(() => {
    scanY.value = withRepeat(
      withTiming(72, {
        duration: 2500,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true,
    );
  }, [scanY]);

  const scanStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: scanY.value }],
  }));

  return (
    <AppScreen
      backgroundColor={theme.colors.offWhite}
      scroll
      contentStyle={styles.container}
    >
      <StatusBar style="dark" backgroundColor={theme.colors.offWhite} />
      <GearOutline color="rgba(240,145,63,0.1)" style={styles.gear} />
      <Animated.View entering={FadeInDown.duration(420)} style={styles.content}>
        <FlowHeader
          showBack
          overline="IDENTITY CHECK"
          title={"Let's verify\nwho you are"}
          subtitle="Keeps everyone safe on every ride."
          progress={{ count: 5, active: 4 }}
        />

        <View style={styles.steps}>
          {kycSteps.map((step) => (
            <AppCard
              key={step.id}
              backgroundColor={
                step.state === "active"
                  ? theme.colors.orangeLight
                  : step.state === "locked"
                    ? "#F5F2ED"
                    : theme.colors.white
              }
              borderColor={
                step.state === "active"
                  ? theme.colors.orange
                  : theme.colors.black
              }
              style={[
                styles.stepCard,
                step.state === "locked" ? styles.stepCardLocked : null,
              ]}
            >
              <View style={styles.stepIcon}>
                <AppText
                  variant="monoSmall"
                  color={
                    step.state === "done"
                      ? theme.colors.white
                      : theme.colors.black
                  }
                >
                  {step.state === "done"
                    ? "DONE"
                    : step.state === "active"
                      ? "02"
                      : "03"}
                </AppText>
              </View>
              <View style={styles.stepText}>
                <AppText
                  variant="h3"
                  color={
                    step.state === "locked" ? "#9F978F" : theme.colors.black
                  }
                >
                  {step.title}
                </AppText>
                <AppText
                  variant="bodySmall"
                  color={
                    step.state === "locked" ? "#BBB1A8" : theme.colors.muted
                  }
                >
                  {step.subtitle}
                </AppText>
              </View>
              <AppBadge
                label={
                  step.state === "done"
                    ? "DONE"
                    : step.state === "active"
                      ? "NOW"
                      : "LATER"
                }
                variant={
                  step.state === "done"
                    ? "green"
                    : step.state === "active"
                      ? "orange"
                      : "white"
                }
              />
            </AppCard>
          ))}
        </View>

        <View style={styles.scanner}>
          <OnLight>
          <Animated.View style={[styles.scanLine, scanStyle]} />
          <View style={styles.cornerTopLeft} />
          <View style={styles.cornerTopRight} />
          <View style={styles.cornerBottomLeft} />
          <View style={styles.cornerBottomRight} />
          <AppText
            variant="monoSmall"
            color="#9A938C"
            style={styles.scannerText}
          >
            PLACE ID CARD HERE
          </AppText>
          </OnLight>
        </View>

        <AppButton
          title="Scan ID now ↗"
          onPress={() => router.push("/rider-home")}
        />
      </Animated.View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: theme.spacing.lg,
  },
  content: {
    gap: theme.spacing.xl,
  },
  gear: {
    position: "absolute",
    left: 10,
    bottom: 30,
  },
  steps: {
    gap: theme.spacing.sm,
  },
  stepCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  stepCardLocked: {
    borderColor: "#DDD1C7",
    shadowOpacity: 0,
    elevation: 0,
  },
  stepIcon: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.orange,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    alignItems: "center",
    justifyContent: "center",
  },
  stepText: {
    flex: 1,
    gap: 2,
  },
  scanner: {
    height: 108,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    borderRadius: theme.radius.md,
    backgroundColor: "#F0EDE8",
    overflow: "hidden",
    ...theme.shadows.card,
  },
  scanLine: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: theme.borders.thick,
    backgroundColor: theme.colors.orange,
  },
  scannerText: {
    position: "absolute",
    top: "50%",
    left: "50%",
    marginLeft: -84,
    marginTop: -8,
  },
  cornerTopLeft: {
    position: "absolute",
    top: 6,
    left: 6,
    width: 16,
    height: 16,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderColor: theme.colors.orange,
  },
  cornerTopRight: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 16,
    height: 16,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderColor: theme.colors.orange,
  },
  cornerBottomLeft: {
    position: "absolute",
    bottom: 6,
    left: 6,
    width: 16,
    height: 16,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderColor: theme.colors.orange,
  },
  cornerBottomRight: {
    position: "absolute",
    bottom: 6,
    right: 6,
    width: 16,
    height: 16,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderColor: theme.colors.orange,
  },
});
