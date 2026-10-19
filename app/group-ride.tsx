import { RBack, RIconDot, RPill, RScreen, RText, rider } from "@/components/rider/kit";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppButton } from "@/components/app-button";
import { AppScreen } from "@/components/app-screen";
import { AppText, OnLight } from "@/components/app-text";
import { BackArrow } from "@/components/back-arrow";
import {
  DiamondPair,
  StarBurst,
  TriangleShape,
} from "@/components/decorative-shapes";
import { FloatingView } from "@/components/motion";
import { theme } from "@/theme";

// ─── Step preview data (main screen) ─────────────────────────────────────────

const STEPS = [
  {
    id: "face-verify",
    number: "01",
    icon: "face" as const,
    label: "Face Verification",
    bg: theme.colors.orangeLight,
    iconBorder: "#F0B48D",
    desc: "Quick face scan before you join any shared vehicle.",
  },
  {
    id: "find-ride",
    number: "02",
    icon: "search" as const,
    label: "Find a Ride",
    bg: "#FFF4CC",
    iconBorder: "#E8C84A",
    desc: "Browse active group rides heading your direction.",
  },
  {
    id: "get-matched",
    number: "03",
    icon: "people" as const,
    label: "Get Matched",
    bg: theme.colors.successLight,
    iconBorder: "#70D9BC",
    desc: "Paired with verified co-riders. Fare splits automatically.",
  },
] as const;

// ─── Guideline sections (inside sheet) ───────────────────────────────────────

const GUIDELINES = [
  {
    id: "identity",
    icon: "verified-user" as const,
    title: "Identity is required",
    body: "Every rider in a group vehicle must complete face verification before booking. This is non-negotiable. Wheelers uses this to make sure the person in the seat matches the account that booked it — keeping everyone safe.",
  },
  {
    id: "fare",
    icon: "receipt-long" as const,
    title: "Your fare is split automatically",
    body: "When you join a group ride, the total fare is divided equally between all matched riders. You only pay your share — no manual splitting, no awkward conversations. The amount is deducted from your wallet at the end of the trip.",
  },
  {
    id: "timing",
    icon: "schedule" as const,
    title: "Departure windows are fixed",
    body: "Group rides operate on a fixed departure schedule. Once a ride is set to depart, it will not wait. Be at your pickup point at least 3 minutes before the window closes, or your seat may be released to another rider.",
  },
  {
    id: "ratings",
    icon: "people" as const,
    title: "You rate your co-riders",
    body: "After every group trip, all riders rate each other. These ratings are used by Wheelers to match you with compatible people in the future. Consistent low ratings can affect your ability to join group rides.",
  },
  {
    id: "cancel",
    icon: "error-outline" as const,
    title: "Cancellations after matching carry a penalty",
    body: "If you cancel after being matched with co-riders, a small penalty fee will be applied to your account. This protects the other riders who planned their trip around your seat. Cancel early if you need to — before matching, it is always free.",
  },
] as const;

// ─── Guide bottom sheet ────────────────────────────────────────────────────────

const READ_SECONDS = 0;

function GuideSheet({
  visible,
  onClose,
  onContinue,
}: {
  visible: boolean;
  onClose: () => void;
  onContinue: () => void;
}) {
  const insets = useSafeAreaInsets();
  const doneRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Silent background timer — starts when sheet opens, resets on close
  useEffect(() => {
    if (!visible) {
      doneRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }
    doneRef.current = false;
    timerRef.current = setTimeout(() => {
      doneRef.current = true;
    }, READ_SECONDS * 1000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [visible]);

  function handleContinuePress() {
    if (!doneRef.current) {
      Alert.alert(
        "Finish reading first",
        "Please take a few minutes to read through the guidelines before continuing.",
        [{ text: "OK" }],
      );
      return;
    }
    Alert.alert(
      "Ready to go?",
      "By continuing you agree to the Wheelers group ride guidelines.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "I understand", onPress: onContinue },
      ],
    );
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={sheet.backdrop}>
        <Pressable style={sheet.dismissArea} onPress={onClose} />

        <Animated.View
          entering={FadeInUp.duration(320)}
          style={[sheet.card, { paddingBottom: insets.bottom + theme.spacing.lg }]}
        >
          {/* Handle */}
          <View style={sheet.handleRow}>
            <View style={sheet.handle} />
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            bounces
            contentContainerStyle={sheet.scroll}
          >
            {/* Sheet title row */}
            <View style={sheet.headerRow}>
              <View style={sheet.headerLeft}>
                <AppText variant="monoSmall" color={theme.colors.orange}>
                  BEFORE YOU CONTINUE
                </AppText>
                <AppText variant="h2" color={theme.colors.black} style={sheet.headerTitle}>
                  Group ride guidelines
                </AppText>
              </View>
              <Pressable onPress={onClose} style={sheet.closeBtn}>
                <MaterialIcons name="close" size={16} color={theme.colors.black} />
              </Pressable>
            </View>

            {/* Intro note */}
            <Animated.View entering={FadeInDown.delay(60).duration(360)}>
              <View style={sheet.introNote}>
                <MaterialIcons name="info-outline" size={14} color={theme.colors.muted} />
                <AppText variant="bodySmall" color={theme.colors.muted} style={sheet.introText}>
                  Read these guidelines before your first group ride. Tapping "I understand" means you agree to follow them.
                </AppText>
              </View>
            </Animated.View>

            {/* Guideline blocks */}
            <View style={sheet.guideList}>
              {GUIDELINES.map((g, i) => (
                <Animated.View
                  key={g.id}
                  entering={FadeInDown.delay(100 + i * 70).duration(380)}
                >
                  <View style={sheet.guideBlock}>
                    <View style={sheet.guideTitleRow}>
                      <View style={sheet.guideIconBox}>
                        <MaterialIcons name={g.icon} size={16} color={theme.colors.orange} />
                      </View>
                      <AppText variant="label" color={theme.colors.black} style={sheet.guideTitle}>
                        {g.title}
                      </AppText>
                    </View>
                    <AppText variant="body" color={theme.colors.muted} style={sheet.guideBody}>
                      {g.body}
                    </AppText>
                  </View>
                </Animated.View>
              ))}
            </View>

            {/* CTA */}
            <Animated.View entering={FadeInDown.delay(460).duration(360)} style={sheet.ctaWrap}>
              <AppButton
                title="I understand — Let's go"
                variant="primary"
                onPress={handleContinuePress}
              />
            </Animated.View>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

/**
 * Group ride is not open to riders yet: the route shows "Coming soon". The
 * built screen is kept below, unused, for the day it is switched on (make it
 * the default export again).
 */
export default function GroupRideComingSoon() {
  return (
    <RScreen contentStyle={comingSoon.screen}>
      <RBack />
      <View style={comingSoon.body}>
        <RIconDot name="people-outline" />
        <RPill label="Coming soon" tone="soft" />
        <RText variant="display">Group ride</RText>
        <RText color={rider.colors.muted} style={comingSoon.words}>
          Share a ride with people going your way and split the price. We are still building it.
        </RText>
      </View>
    </RScreen>
  );
}

const comingSoon = StyleSheet.create({
  screen: { paddingTop: 12, gap: 16 },
  body: { flex: 1, justifyContent: "center", gap: 12, paddingBottom: 80 },
  words: { maxWidth: 320 },
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function GroupRideScreen() {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);

  const spin = useSharedValue(0);
  useEffect(() => {
    spin.value = withRepeat(
      withTiming(1, { duration: 12000, easing: Easing.linear }),
      -1,
      false,
    );
  }, [spin]);
  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value * 360}deg` }],
  }));

  return (
    <AppScreen
      backgroundColor={theme.colors.offWhite}
      scroll
      contentStyle={styles.screen}
      safeAreaEdges={["top", "left", "right"]}
    >
      <StatusBar style="dark" />

      {/* Floating decorative shapes */}
      <FloatingView style={styles.shapeStar} distance={8} delay={0} rotate={6}>
        <Animated.View style={spinStyle}>
          <StarBurst color="rgba(240,145,63,0.13)" width={44} height={44} />
        </Animated.View>
      </FloatingView>
      <FloatingView style={styles.shapeTri} distance={6} delay={400} rotate={-8}>
        <TriangleShape color="rgba(240,145,63,0.10)" width={28} height={28} />
      </FloatingView>
      <FloatingView style={styles.shapeDiamond} distance={7} delay={200} rotate={4}>
        <DiamondPair color="rgba(13,13,13,0.07)" width={30} height={30} />
      </FloatingView>

      {/* Nav row */}
      <View style={styles.navRow}>
        <BackArrow />
        <View style={styles.tagPill}>
          <OnLight>
          <AppText variant="monoSmall" color={theme.colors.orange}>
            GROUP RIDE
          </AppText>
          </OnLight>
        </View>
      </View>

      {/* Hero */}
      <Animated.View entering={FadeInDown.delay(60).duration(400)} style={styles.heroBlock}>
        <AppText style={styles.heroTitle} color={theme.colors.black}>
          Split the trip.{"\n"}Share the road.
        </AppText>
        <AppText variant="body" color={theme.colors.muted} style={styles.heroSub}>
          Verified riders. Shared seats.{"\n"}Automatic fare split.
        </AppText>
      </Animated.View>

      {/* Section label */}
      <Animated.View entering={FadeInDown.delay(140).duration(380)}>
        <AppText variant="monoSmall" color={theme.colors.muted} style={styles.sectionLabel}>
          3 STEPS
        </AppText>
      </Animated.View>

      {/* Step blocks — wallet pageCard pattern */}
      <View style={styles.list}>
        {STEPS.map((step, i) => (
          <Animated.View
            key={step.id}
            entering={FadeInDown.delay(180 + i * 65).duration(380)}
          >
            <View style={[styles.stepCard, { backgroundColor: step.bg }]}>
              <View style={[styles.stepIconWrap, { borderColor: step.iconBorder }]}>
                <OnLight>
                <MaterialIcons name={step.icon} size={18} color={theme.colors.black} />
                </OnLight>
              </View>
              <View style={styles.stepCardBody}>
                <AppText variant="label" color={theme.colors.black}>
                  {step.label}
                </AppText>
                <AppText variant="bodySmall" color={theme.colors.muted}>
                  {step.desc}
                </AppText>
              </View>
              <View style={styles.stepNumBox}>
                <OnLight>
                <AppText variant="monoSmall" color={theme.colors.muted} style={styles.stepNum}>
                  {step.number}
                </AppText>
                </OnLight>
              </View>
            </View>
          </Animated.View>
        ))}
      </View>

      {/* Teaser note */}
      <Animated.View entering={FadeInDown.delay(420).duration(380)}>
        <View style={styles.teaserCard}>
          <OnLight>
          <MaterialIcons name="info-outline" size={15} color={theme.colors.muted} />
          <AppText variant="bodySmall" color={theme.colors.muted} style={styles.teaserText}>
            Tap below to read the group ride guidelines before getting started.
          </AppText>
          </OnLight>
        </View>
      </Animated.View>

      {/* CTA */}
      <Animated.View entering={FadeInDown.delay(500).duration(380)}>
        <AppButton
          title="Get Started"
          variant="primary"
          onPress={() => setSheetOpen(true)}
        />
      </Animated.View>

      <GuideSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onContinue={() => {
          setSheetOpen(false);
          router.push("/group-ride/face-verify");
        }}
      />
    </AppScreen>
  );
}

// ─── Main screen styles ────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    gap: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.xxxl,
  },
  shapeStar: {
    position: "absolute",
    top: 48,
    right: 12,
  },
  shapeTri: {
    position: "absolute",
    top: 200,
    right: 28,
  },
  shapeDiamond: {
    position: "absolute",
    bottom: 220,
    left: 8,
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tagPill: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 5,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.orange,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.orangeLight,
  },
  heroBlock: {
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
  heroTitle: {
    fontFamily: "ClashDisplay_700Bold",
    fontSize: 34,
    lineHeight: 38,
    letterSpacing: -1.1,
  },
  heroSub: {
    lineHeight: 21,
  },
  sectionLabel: {
    letterSpacing: 1,
    marginBottom: -theme.spacing.xs,
  },
  list: {
    gap: theme.spacing.sm,
  },
  stepCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    ...theme.shadows.card,
  },
  stepIconWrap: {
    width: 38,
    height: 38,
    borderRadius: theme.radius.pill,
    borderWidth: theme.borders.regular,
    backgroundColor: theme.colors.white,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  stepCardBody: {
    flex: 1,
    gap: 2,
  },
  stepNumBox: {
    width: 26,
    height: 26,
    borderRadius: theme.radius.xs,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.white,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  stepNum: {
    fontSize: 9,
    letterSpacing: 0.3,
  },
  teaserCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing.sm,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.white,
    padding: theme.spacing.md,
    ...theme.shadows.card,
  },
  teaserText: {
    flex: 1,
    lineHeight: 18,
  },
});

// ─── Sheet styles ──────────────────────────────────────────────────────────────

const sheet = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(13,13,13,0.44)",
    justifyContent: "flex-end",
  },
  dismissArea: {
    flex: 1,
  },
  card: {
    backgroundColor: theme.colors.offWhite,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    borderWidth: theme.borders.thick,
    borderBottomWidth: 0,
    borderColor: theme.colors.black,
    maxHeight: "88%",
    ...theme.shadows.card,
  },
  handleRow: {
    alignItems: "center",
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.xs,
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.black,
    opacity: 0.16,
  },
  scroll: {
    paddingHorizontal: theme.spacing.gutter,
    paddingBottom: theme.spacing.xl,
    gap: theme.spacing.lg,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  headerLeft: {
    gap: 2,
    flex: 1,
  },
  headerTitle: {
    letterSpacing: -0.4,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.pill,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.white,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: theme.spacing.md,
  },
  introNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.white,
  },
  introText: {
    flex: 1,
    lineHeight: 18,
  },
  guideList: {
    gap: theme.spacing.sm,
  },
  // Each guideline — white card, black border, readable note form
  guideBlock: {
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.white,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    ...theme.shadows.card,
  },
  guideTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  guideIconBox: {
    width: 30,
    height: 30,
    borderRadius: theme.radius.pill,
    borderWidth: theme.borders.regular,
    borderColor: "#F0B48D",
    backgroundColor: theme.colors.orangeLight,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  guideTitle: {
    flex: 1,
    lineHeight: 17,
  },
  guideBody: {
    lineHeight: 21,
    paddingLeft: 30 + theme.spacing.sm, // aligns under title, past the icon
  },
  ctaWrap: {
    marginTop: theme.spacing.xs,
  },
});
