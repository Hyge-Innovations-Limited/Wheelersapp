import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { RAvatar, RBack, RText, rider } from "@/components/rider/kit";
import { useCallDriver } from "@/components/rider/use-call-driver";
import { useKeyboardHeight } from "@/hooks/use-keyboard";
import { getAccessTokenWithRetry } from "@/lib/access-token";
import { getRideChatMessages, type ChatMessageResponse } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { estimateEtaMinutes } from "@/lib/geo";
import { useSearchAgainRedirect } from "@/hooks/use-search-again-redirect";
import { useRideSession } from "@/lib/ride-session";
import {
  markTripChatSeen,
  setOpenTripChat,
  useTripChatClosed,
  useTripChatOpenRequests,
} from "@/lib/trip-chat";

const { colors, fonts } = rider;

/** The server's own limit on one message. */
const MAX_LENGTH = 1000;
/** How long after a send an error from the server is taken to be about that message. */
const ERROR_WINDOW_MS = 10_000;
const QUICK_REPLIES = ["I am outside", "I am coming out now", "Where are you?", "Please call me"] as const;

type ChatMsg = {
  id: string;
  senderId: string;
  senderRole: "RIDER" | "DRIVER";
  content: string;
  kind?: "text" | "call";
  createdAt: string;
};

/**
 * The trip chat, full screen: text only, between the rider and this trip's
 * driver. Messages arrive on the ride session's socket; the history is loaded
 * each time the screen opens. Calls leave a line here too.
 */
export default function RiderChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { getAccessToken } = useAuth();
  const { chatMessages, currentRide, error: sessionError, sendChatMessage } = useRideSession();
  const { canCall, busy: callBusy, checking: callChecking, callDriver } = useCallDriver(currentRide);

  const rideId = currentRide?.rideId ?? null;
  const status = currentRide?.status;
  const driver = currentRide?.driver;

  const [historyMessages, setHistoryMessages] = useState<ChatMsg[]>([]);
  const [openPerServer, setChatOpen] = useState(true);
  // The server says the trip ended: closed now, not at the next load.
  const closedLive = useTripChatClosed(rideId);
  const chatOpen = openPerServer && !closedLive;
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  /** What the server said about the last message, in its own words. */
  const [notice, setNotice] = useState<string | null>(null);
  const pendingRef = useRef<{ text: string; at: number; errorBefore: string | null } | null>(null);
  const listRef = useRef<FlatList<ChatMsg>>(null);

  // The trip is over or gone: back to the trip screen, which knows where to go next.
  const over = !currentRide || status === "cancelled" || status === "completed";
  useEffect(() => {
    if (!over) return;
    if (router.canGoBack()) router.back();
    else router.replace("/rider");
  }, [over, router]);

  // The driver pulled out and the search goes on (searchingAgain): back to the
  // trip screen, which goes on to Finding drivers (or there directly).
  useSearchAgainRedirect("back");

  // On screen: its pushes show no banner, and what is here counts as read.
  useEffect(() => {
    if (!rideId) return;
    setOpenTripChat(rideId);
    return () => setOpenTripChat(null);
  }, [rideId]);

  // A tapped chat notification for this trip: it is already open.
  useTripChatOpenRequests(rideId, () => undefined);

  // The history: anything sent while the socket was down is in it.
  const loadHistory = useCallback(
    async (isCancelled: () => boolean) => {
      if (!rideId) return;
      try {
        const accessToken = await getAccessTokenWithRetry(getAccessToken);
        if (!accessToken || isCancelled()) return;
        const data = await getRideChatMessages({ accessToken, rideId, limit: 100 });
        if (isCancelled()) return;
        setHistoryMessages(
          data.items.map((m: ChatMessageResponse) => ({
            id: m.id,
            senderId: m.senderId,
            senderRole: m.senderRole,
            content: m.content,
            kind: m.kind,
            createdAt: m.createdAt,
          })),
        );
        if (typeof data.open === "boolean") setChatOpen(data.open);
      } catch {
        // non-blocking: the socket's messages still show
      }
    },
    [getAccessToken, rideId],
  );

  useEffect(() => {
    let cancelled = false;
    void loadHistory(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [loadHistory]);

  // Merge history + realtime, deduplicate by id
  const allMessages = useMemo(() => {
    const merged = [
      ...historyMessages,
      ...chatMessages.filter((m) => !m.rideId || m.rideId === rideId),
    ].reduce<ChatMsg[]>((acc, msg) => {
      if (!acc.some((m) => m.id === msg.id)) acc.push(msg);
      return acc;
    }, []);
    merged.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return merged;
  }, [chatMessages, historyMessages, rideId]);
  const newest = allMessages[allMessages.length - 1]?.createdAt;

  useEffect(() => {
    if (rideId) markTripChatSeen(rideId, newest);
  }, [rideId, newest]);

  // My last message came back from the server: it went through.
  const lastMine = useMemo(() => {
    for (let i = allMessages.length - 1; i >= 0; i -= 1) {
      const message = allMessages[i]!;
      if (message.senderRole === "RIDER" && message.kind !== "call") return message;
    }
    return null;
  }, [allMessages]);
  useEffect(() => {
    const pending = pendingRef.current;
    if (pending && lastMine && lastMine.content === pending.text) {
      pendingRef.current = null;
      setNotice(null);
    }
  }, [lastMine]);

  // The server refused it (chat closed, too long, too many too fast): show its
  // reason, give the words back, and ask again whether the chat is still open.
  useEffect(() => {
    const pending = pendingRef.current;
    if (!pending || !sessionError || sessionError === pending.errorBefore) return;
    if (Date.now() - pending.at > ERROR_WINDOW_MS) return;
    pendingRef.current = null;
    setNotice(sessionError);
    setDraft((current) => current || pending.text);
    void loadHistory(() => false);
  }, [loadHistory, sessionError]);

  const send = async (words: string) => {
    const text = words.trim();
    if (!rideId || !text || sending || !chatOpen) return;
    const fromBox = words === draft;
    setSending(true);
    if (fromBox) setDraft("");
    pendingRef.current = { text, at: Date.now(), errorBefore: sessionError };
    try {
      await sendChatMessage(rideId, text);
    } catch {
      // Not connected: give the words back rather than lose them.
      pendingRef.current = null;
      if (fromBox) setDraft(text);
      Alert.alert("Not sent", "Check your connection and try again.");
    } finally {
      setSending(false);
    }
  };

  // Room for the keyboard. Some platforms shrink the screen themselves when it
  // opens, so only the shortfall is added.
  const keyboardHeight = useKeyboardHeight();
  const [viewHeight, setViewHeight] = useState(0);
  const baselineRef = useRef(0);
  useEffect(() => {
    if (keyboardHeight === 0 && viewHeight > 0) baselineRef.current = viewHeight;
  }, [keyboardHeight, viewHeight]);
  const onLayout = (event: LayoutChangeEvent) => {
    const { height } = event.nativeEvent.layout;
    setViewHeight((current) => (Math.abs(current - height) > 1 ? height : current));
  };
  const alreadyShrunk = baselineRef.current > 0 ? Math.max(0, baselineRef.current - viewHeight) : 0;
  const bottomRoom = keyboardHeight > 0 ? Math.max(0, keyboardHeight - alreadyShrunk) : insets.bottom;

  const driverName = driver?.driverName?.trim() || "Your driver";
  const firstName = driver?.driverName?.trim().split(/\s+/)[0];
  const plate = driver?.vehiclePlate?.trim();

  const liveKm = currentRide?.driverLocation?.distanceToNextStopKm;
  const etaMinutes =
    status !== "matched"
      ? null
      : typeof liveKm === "number" && Number.isFinite(liveKm)
        ? estimateEtaMinutes(liveKm)
        : driver?.etaSeconds
          ? Math.max(1, Math.ceil(driver.etaSeconds / 60))
          : null;
  const pickup = currentRide?.itinerary.pickup;

  const canSend = chatOpen && !sending && draft.trim().length > 0;

  return (
    <View onLayout={onLayout} style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <RBack />
        <RAvatar name={driver?.driverName} size={44} />
        <View style={styles.headerText}>
          <RText accessibilityRole="header" numberOfLines={1} style={styles.name} variant="heading">
            {driverName}
          </RText>
          <RText numberOfLines={1} variant="caption">
            {plate ? `Your driver · ${plate}` : "Your driver"}
          </RText>
        </View>
        {canCall || callChecking ? (
          <Pressable
            accessibilityLabel={firstName ? `Call ${firstName}` : "Call your driver"}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canCall || callBusy }}
            disabled={!canCall || callBusy}
            onPress={callDriver}
            style={({ pressed }) => [
              styles.call,
              !canCall || callBusy ? styles.dimmed : null,
              pressed ? styles.pressed : null,
            ]}>
            <Ionicons color={colors.ink} name="call" size={20} />
          </Pressable>
        ) : null}
      </View>

      {etaMinutes ? (
        <View style={styles.eta}>
          <View>
            <RText color={colors.onInkMuted} style={styles.etaLabel}>
              Arrives in
            </RText>
            <RText color={colors.orange} variant="bodyBold">
              {etaMinutes} {etaMinutes === 1 ? "minute" : "minutes"}
            </RText>
          </View>
          {pickup ? (
            <RText color={colors.onInkMuted} numberOfLines={2} style={styles.etaPickup}>
              Pickup: {pickup}
            </RText>
          ) : null}
        </View>
      ) : null}

      <FlatList
        contentContainerStyle={styles.messages}
        data={allMessages}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <RText color={colors.muted} style={styles.empty} variant="small">
            Messages here stay between you and your driver. Wheelers keeps a copy for your safety.
          </RText>
        }
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        ref={listRef}
        renderItem={({ item }) => {
          const time = new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          if (item.kind === "call") {
            return (
              <View style={styles.line}>
                <RText variant="caption">
                  {item.content} · {time}
                </RText>
              </View>
            );
          }
          const mine = item.senderRole === "RIDER";
          return (
            <View style={mine ? styles.rowMine : styles.rowTheirs}>
              <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                <RText style={mine ? styles.textMine : styles.textTheirs}>{item.content}</RText>
              </View>
              <RText style={styles.time}>{time}</RText>
            </View>
          );
        }}
        style={styles.list}
      />

      {chatOpen ? null : (
        <View accessibilityLiveRegion="polite" style={styles.banner}>
          <RText color={colors.muted} style={styles.center} variant="small">
            {notice ?? "This trip has ended, so the chat is closed."}
          </RText>
        </View>
      )}
      {chatOpen && notice ? (
        <View accessibilityLiveRegion="polite" style={styles.banner}>
          <RText color={colors.danger} style={styles.center} variant="smallBold">
            {notice}
          </RText>
        </View>
      ) : null}

      {chatOpen ? (
        <View style={styles.quickWrap}>
          <ScrollView
            contentContainerStyle={styles.quick}
            horizontal
            keyboardShouldPersistTaps="handled"
            showsHorizontalScrollIndicator={false}>
            {QUICK_REPLIES.map((words) => (
              <Pressable
                accessibilityLabel={`Send: ${words}`}
                accessibilityRole="button"
                disabled={sending}
                key={words}
                onPress={() => void send(words)}
                style={({ pressed }) => [styles.chip, pressed ? styles.pressed : null]}>
                <RText style={styles.chipText}>{words}</RText>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <View style={[styles.composer, { paddingBottom: 10 + bottomRoom }]}>
        <TextInput
          accessibilityLabel="Message"
          editable={chatOpen}
          maxLength={MAX_LENGTH}
          multiline
          onChangeText={setDraft}
          placeholder={chatOpen ? (firstName ? `Message ${firstName}` : "Message your driver") : "Chat closed"}
          placeholderTextColor="#8C837A"
          style={[styles.input, chatOpen ? null : styles.dimmed]}
          value={draft}
        />
        <Pressable
          accessibilityLabel="Send"
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSend }}
          disabled={!canSend}
          onPress={() => void send(draft)}
          style={({ pressed }) => [styles.send, canSend ? null : styles.dimmed, pressed ? styles.pressed : null]}>
          <Ionicons color={colors.orange} name="arrow-up" size={22} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  pressed: { opacity: 0.72 },
  dimmed: { opacity: 0.45 },
  center: { textAlign: "center" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: rider.gutter,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  headerText: { flex: 1, minWidth: 0 },
  name: { fontSize: 20, lineHeight: 24 },
  call: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.orange,
    alignItems: "center",
    justifyContent: "center",
  },

  eta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginHorizontal: rider.gutter,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: rider.radius.md,
    backgroundColor: colors.ink,
  },
  etaLabel: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  etaPickup: { flex: 1, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, textAlign: "right" },

  list: { flex: 1 },
  messages: { flexGrow: 1, paddingHorizontal: rider.gutter, paddingVertical: 14, gap: 10 },
  empty: { textAlign: "center", paddingHorizontal: 16, paddingTop: 16 },
  line: {
    alignSelf: "center",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: rider.radius.pill,
    backgroundColor: colors.tint,
  },
  rowMine: { alignItems: "flex-end", gap: 3 },
  rowTheirs: { alignItems: "flex-start", gap: 3 },
  bubble: { maxWidth: "80%", paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMine: {
    backgroundColor: colors.orange,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 4,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
  },
  bubbleTheirs: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
  },
  textMine: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 21, color: colors.ink },
  textTheirs: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.ink },
  time: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 15, color: colors.muted },

  banner: { paddingHorizontal: rider.gutter, paddingVertical: 8 },

  quickWrap: { flexShrink: 0, paddingBottom: 8 },
  quick: { paddingHorizontal: rider.gutter, gap: 8 },
  chip: {
    height: 44,
    paddingHorizontal: 14,
    borderRadius: rider.radius.pill,
    borderWidth: 2,
    borderColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  chipText: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 19 },

  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: rider.gutter,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.card,
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
    borderColor: colors.ink,
    backgroundColor: colors.cream,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.ink,
  },
  send: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
});
