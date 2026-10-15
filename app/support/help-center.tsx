import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { RBack, RButton, RScreen, RText, rider } from "@/components/rider/kit";

/** What riders most often write in about. Each one opens the chat on that subject. */
const RIDER_TOPICS = [
  "Lost item",
  "Wrong charge",
  "Wallet not credited",
  "Report a driver",
  "Scheduled ride did not arrive",
];

/** What drivers most often write in about. */
const DRIVER_TOPICS = [
  "Payout not received",
  "Wrong fare or commission",
  "Problem with a rider",
  "My papers or verification",
  "Item left in my car",
];

export default function HelpCenterScreen() {
  const router = useRouter();
  const { who } = useLocalSearchParams<{ who?: string }>();
  const TOPICS = who === "driver" ? DRIVER_TOPICS : RIDER_TOPICS;

  return (
    <RScreen contentStyle={styles.container} scroll>
      <StatusBar backgroundColor={rider.colors.cream} style="dark" />

      <View style={styles.backRow}>
        <RBack />
      </View>

      <View style={styles.intro}>
        <RText accessibilityRole="header" variant="display">
          How can we help?
        </RText>
        <RText color={rider.colors.muted}>Our support team replies as soon as possible.</RText>
      </View>

      <View>
        {TOPICS.map((topic, index) => (
          <Pressable
            accessibilityLabel={topic}
            accessibilityRole="button"
            key={topic}
            onPress={() => router.push({ pathname: "/support/chat", params: { topic } })}
            style={({ pressed }) => [
              styles.topic,
              index < TOPICS.length - 1 ? styles.topicDivider : null,
              pressed ? styles.pressed : null,
            ]}>
            <Text maxFontSizeMultiplier={1.2} style={styles.topicText}>
              {topic}
            </Text>
            <Ionicons color={rider.colors.muted} name="chevron-forward" size={18} />
          </Pressable>
        ))}
      </View>

      <View style={styles.spacer} />

      <RButton
        accessibilityLabel="Chat with support"
        onPress={() => router.push("/support/chat")}
        title="Chat with support"
      />
    </RScreen>
  );
}

const styles = StyleSheet.create({
  container: { gap: 14, paddingTop: 12, paddingBottom: 16 },
  pressed: { opacity: 0.72 },
  backRow: { flexDirection: "row" },
  intro: { gap: 8 },
  topic: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    minHeight: 54,
    paddingVertical: 8,
  },
  topicDivider: { borderBottomWidth: 1, borderBottomColor: rider.colors.line },
  topicText: {
    flex: 1,
    fontFamily: rider.fonts.semibold,
    fontSize: 16,
    lineHeight: 22,
    color: rider.colors.ink,
  },
  spacer: { flexGrow: 1, minHeight: 8 },
});
