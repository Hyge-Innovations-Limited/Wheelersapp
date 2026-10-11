import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BrandLogo } from "@/components/brand-logo";
import { RBack, RButton, RText, rider } from "@/components/rider/kit";
import { getAccessTokenWithRetry } from "@/lib/access-token";
import { useAuth } from "@/lib/auth";
import { toUserMessage } from "@/lib/error-messages";
import { useRideSession } from "@/lib/ride-session";
import {
  SUPPORT_MESSAGE_MAX,
  getSupportChat,
  mergeSupportMessages,
  messageTime,
  sendSupportMessage,
  type SupportConversation,
  type SupportMessage,
} from "@/lib/support-chat";

/** How often an open chat asks the server for new replies. */
const REFRESH_MS = 4000;
const QUICK_REPLIES = ["Driver is not moving", "Wrong route", "I feel unsafe", "Payment problem"];

/**
 * Chat with Wheelers support. Messages go to the support team's inbox in the
 * admin panel, along with the trip the person is on; replies show here.
 */
export default function SupportChatScreen() {
  const params = useLocalSearchParams<{ topic?: string; rideId?: string }>();
  const topic = typeof params.topic === "string" && params.topic.trim() ? params.topic.trim() : null;
  const askedRideId = typeof params.rideId === "string" && params.rideId ? params.rideId : null;

  const insets = useSafeAreaInsets();
  const { getAccessToken } = useAuth();
  const { currentRide } = useRideSession();
  const rideId = askedRideId ?? currentRide?.rideId ?? null;

  const scrollRef = useRef<ScrollView>(null);
  const [conversation, setConversation] = useState<SupportConversation | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [draft, setDraft] = useState(topic ?? "");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (quiet: boolean) => {
      try {
        const accessToken = await getAccessTokenWithRetry(getAccessToken);
        if (!accessToken) throw new Error("Please sign in again.");
        const chat = await getSupportChat(accessToken);
        setConversation(chat.conversation);
        setMessages((shown) => mergeSupportMessages(quiet ? shown : [], chat.messages));
        if (!quiet) setError(null);
      } catch (failure) {
        // A missed refresh keeps what is on screen; only the first load says so.
        if (!quiet) setError(toUserMessage(failure, "We could not load your chat. Please try again."));
      } finally {
        setLoading(false);
      }
    },
    [getAccessToken],
  );

  useFocusEffect(
    useCallback(() => {
      void load(false);
      const timer = setInterval(() => void load(true), REFRESH_MS);
      return () => clearInterval(timer);
    }, [load]),
  );

  useEffect(() => {
    const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(timer);
  }, [messages.length]);

  async function send(text?: string) {
    const content = (text ?? draft).trim();
    if (!content || sending) return;
    setSending(true);
    setError(null);
    try {
      const accessToken = await getAccessTokenWithRetry(getAccessToken);
      if (!accessToken) throw new Error("Please sign in again.");
      const sent = await sendSupportMessage({ accessToken, content, rideId, topic });
      setConversation(sent.conversation);
      setMessages((shown) => mergeSupportMessages(shown, [sent.message]));
      if (text === undefined) setDraft("");
    } catch (failure) {
      setError(toUserMessage(failure, "Your message was not sent. Please try again."));
    } finally {
      setSending(false);
    }
  }

  const resolved = conversation?.status === "resolved";
  const agent = conversation?.agentName;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <RBack />
        <BrandLogo size={44} />
        <View style={styles.headerText}>
          <RText variant="heading" style={styles.headerTitle}>
            Wheelers support
          </RText>
          <RText color={rider.colors.muted} variant="caption">
            {agent ? `${agent} is helping you` : "We reply as soon as we can"}
          </RText>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.messages}
        keyboardShouldPersistTaps="handled"
        ref={scrollRef}
        showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color={rider.colors.ink} style={styles.loader} />
        ) : messages.length === 0 ? (
          <View style={styles.empty}>
            <RText variant="heading">How can we help?</RText>
            <RText color={rider.colors.muted}>
              {rideId
                ? "Tell us what is happening. We can see the trip you are on."
                : "Tell us what happened and we will get back to you here."}
            </RText>
          </View>
        ) : (
          messages.map((message) =>
            message.from === "you" ? (
              <View key={message.id} style={styles.mine}>
                <Text style={styles.mineText}>{message.content}</Text>
                <Text style={styles.mineTime}>{messageTime(message.createdAt)}</Text>
              </View>
            ) : (
              <View key={message.id} style={styles.theirsWrap}>
                <Text style={styles.sender}>{message.senderName ?? "Support"} · Support</Text>
                <View style={styles.theirs}>
                  <Text style={styles.theirsText}>{message.content}</Text>
                  <Text style={styles.theirsTime}>{messageTime(message.createdAt)}</Text>
                </View>
              </View>
            ),
          )
        )}

        {resolved ? (
          <View style={styles.resolved}>
            <Ionicons color={rider.colors.green} name="checkmark-circle" size={18} />
            <Text style={styles.resolvedText}>
              This chat was marked resolved. Send a message to start a new one.
            </Text>
          </View>
        ) : null}
      </ScrollView>

      {error ? (
        <View style={styles.errorRow}>
          <Text accessibilityLiveRegion="polite" style={styles.error}>
            {error}
          </Text>
          {messages.length === 0 && !loading ? (
            <RButton onPress={() => void load(false)} size="md" title="Try again" variant="ghost" />
          ) : null}
        </View>
      ) : null}

      {messages.length === 0 && !loading ? (
        <ScrollView
          contentContainerStyle={styles.chips}
          horizontal
          keyboardShouldPersistTaps="handled"
          showsHorizontalScrollIndicator={false}
          style={styles.chipsRow}>
          {QUICK_REPLIES.map((reply) => (
            <Pressable
              accessibilityRole="button"
              disabled={sending}
              key={reply}
              onPress={() => void send(reply)}
              style={({ pressed }) => [styles.chip, pressed ? styles.pressed : null]}>
              <Text style={styles.chipText}>{reply}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TextInput
          accessibilityLabel="Message"
          maxLength={SUPPORT_MESSAGE_MAX}
          multiline
          onChangeText={setDraft}
          placeholder="Type a message"
          placeholderTextColor="#8C837A"
          style={styles.input}
          value={draft}
        />
        <Pressable
          accessibilityLabel="Send"
          accessibilityRole="button"
          accessibilityState={{ disabled: !draft.trim() || sending }}
          disabled={!draft.trim() || sending}
          onPress={() => void send()}
          style={({ pressed }) => [
            styles.send,
            !draft.trim() || sending ? styles.sendOff : null,
            pressed ? styles.pressed : null,
          ]}>
          {sending ? (
            <ActivityIndicator color={rider.colors.ink} />
          ) : (
            <Ionicons color={rider.colors.ink} name="send" size={20} />
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const bubble = { maxWidth: "82%", paddingHorizontal: 14, paddingVertical: 10 } as const;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: rider.colors.cream },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: rider.colors.line,
  },
  headerText: { flex: 1, minWidth: 0 },
  headerTitle: { fontSize: 20, lineHeight: 24 },
  messages: { flexGrow: 1, paddingHorizontal: 20, paddingVertical: 14, gap: 10 },
  loader: { marginTop: 40 },
  empty: { gap: 6, paddingTop: 24 },
  mine: { ...bubble, alignSelf: "flex-end", borderRadius: 18, borderTopRightRadius: 4, backgroundColor: rider.colors.ink },
  mineText: { fontFamily: rider.fonts.regular, fontSize: 15, lineHeight: 21, color: rider.colors.cream },
  mineTime: { fontFamily: rider.fonts.medium, fontSize: 11, color: rider.colors.onInkMuted, alignSelf: "flex-end", marginTop: 2 },
  theirsWrap: { alignSelf: "flex-start", maxWidth: "82%", gap: 3 },
  sender: { fontFamily: rider.fonts.bold, fontSize: 12, color: rider.colors.muted },
  theirs: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    borderTopLeftRadius: 4,
    backgroundColor: rider.colors.card,
    borderWidth: 1,
    borderColor: rider.colors.line,
  },
  theirsText: { fontFamily: rider.fonts.regular, fontSize: 15, lineHeight: 21, color: rider.colors.ink },
  theirsTime: { fontFamily: rider.fonts.medium, fontSize: 11, color: rider.colors.muted, alignSelf: "flex-end", marginTop: 2 },
  resolved: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 14,
    backgroundColor: rider.colors.greenSoft,
  },
  resolvedText: { flex: 1, fontFamily: rider.fonts.semibold, fontSize: 14, lineHeight: 19, color: rider.colors.green },
  errorRow: { paddingHorizontal: 20, paddingBottom: 8, gap: 8 },
  error: { fontFamily: rider.fonts.semibold, fontSize: 14, lineHeight: 19, color: rider.colors.danger },
  chipsRow: { flexGrow: 0 },
  chips: { paddingHorizontal: 20, paddingBottom: 8, gap: 8 },
  chip: {
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: rider.colors.ink,
    justifyContent: "center",
  },
  chipText: { fontFamily: rider.fonts.semibold, fontSize: 14, color: rider.colors.ink },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: rider.colors.line,
    backgroundColor: rider.colors.card,
  },
  input: {
    flex: 1,
    minHeight: 48,
    maxHeight: 120,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: rider.colors.ink,
    backgroundColor: rider.colors.cream,
    fontFamily: rider.fonts.regular,
    fontSize: 16,
    color: rider.colors.ink,
  },
  send: { width: 48, height: 48, borderRadius: 24, backgroundColor: rider.colors.orange, alignItems: "center", justifyContent: "center" },
  sendOff: { opacity: 0.4 },
  pressed: { opacity: 0.75 },
});
