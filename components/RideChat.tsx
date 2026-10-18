import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  type LayoutChangeEvent,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandLogo } from '@/components/brand-logo';
import { rider } from '@/constants/rider-theme';
import { useKeyboardHeight } from '@/hooks/use-keyboard';
import { useAuth } from '@/lib/auth';
import { getAccessTokenWithRetry } from '@/lib/access-token';
import { getRideChatMessages, type ChatMessageResponse } from '@/lib/api';
import { markTripChatSeen, setOpenTripChat, useTripChatClosed } from '@/lib/trip-chat';

type ChatMsg = {
  id: string;
  senderId: string;
  senderRole: 'RIDER' | 'DRIVER';
  content: string;
  kind?: 'text' | 'call';
  createdAt: string;
};

type RideChatProps = {
  visible: boolean;
  onClose: () => void;
  rideId: string;
  /** WS-received messages from the session provider */
  realtimeMessages: (ChatMsg & { rideId?: string })[];
  /** Sends a chat message over WebSocket */
  onSend: (rideId: string, content: string) => Promise<void>;
  /** The current user's role in this ride */
  userRole: 'RIDER' | 'DRIVER';
  /** Who is on the other end, for the title: "Chat with Tunde". */
  otherName?: string | null;
};

/**
 * The trip chat: text only, between this trip's rider and driver, open from the
 * match until 30 minutes after the trip. Messages arrive on the socket; the
 * history is loaded each time it opens. Calls leave a line here too.
 */
export function RideChat({
  visible,
  onClose,
  rideId,
  realtimeMessages,
  onSend,
  userRole,
  otherName,
}: RideChatProps) {
  const { getAccessToken } = useAuth();
  const [historyMessages, setHistoryMessages] = useState<ChatMsg[]>([]);
  const [openPerServer, setChatOpen] = useState(true);
  // The server says the trip ended (driver app): closed now, not at the next load.
  const closedLive = useTripChatClosed(rideId);
  const chatOpen = openPerServer && !closedLive;
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);

  // On screen: its pushes show no banner, and what is here counts as read.
  useEffect(() => {
    if (!visible) return;
    setOpenTripChat(rideId);
    return () => setOpenTripChat(null);
  }, [visible, rideId]);

  // The history, each time it opens: anything sent while the socket was down is in it.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void (async () => {
      try {
        const accessToken = await getAccessTokenWithRetry(getAccessToken);
        if (!accessToken || cancelled) return;
        const data = await getRideChatMessages({ accessToken, rideId, limit: 100 });
        if (cancelled) return;
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
        if (typeof data.open === 'boolean') setChatOpen(data.open);
      } catch {
        // non-blocking: the socket's messages still show
      }
    })();
    return () => { cancelled = true; };
  }, [visible, rideId, getAccessToken]);

  // Merge history + realtime, deduplicate by id
  const allMessages = [
    ...historyMessages,
    ...realtimeMessages.filter((m) => !m.rideId || m.rideId === rideId),
  ].reduce<ChatMsg[]>((acc, msg) => {
    if (!acc.some((m) => m.id === msg.id)) acc.push(msg);
    return acc;
  }, []);
  allMessages.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const newest = allMessages[allMessages.length - 1]?.createdAt;

  useEffect(() => {
    if (visible) markTripChatSeen(rideId, newest);
  }, [visible, rideId, newest]);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || sending || !chatOpen) return;
    setSending(true);
    setDraft('');
    try {
      await onSend(rideId, text);
    } catch {
      // Not connected: give the words back rather than lose them.
      setDraft(text);
      Alert.alert('Not sent', 'Check your connection and try again.');
    } finally {
      setSending(false);
    }
  };

  const isSelf = (msg: ChatMsg) => msg.senderRole === userRole;
  const firstName = otherName?.trim().split(/\s+/)[0];
  const otherWord = userRole === 'DRIVER' ? 'rider' : 'driver';
  const shownName = firstName || `Your ${otherWord}`;
  const canSend = chatOpen && draft.trim().length > 0 && !sending;

  // The status bar on Android (the sheet is drawn under it), nothing extra on an iPhone's page sheet.
  const insets = useSafeAreaInsets();
  const topRoom = Platform.OS === 'android' ? insets.top : 0;

  // Room for the keyboard, as on the support chat: only the shortfall the phone did not make itself.
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
  const bottomRoom = keyboardHeight > 0 ? 10 + Math.max(0, keyboardHeight - alreadyShrunk) : Math.max(insets.bottom, 12);

  useEffect(() => {
    if (keyboardHeight > 0) listRef.current?.scrollToEnd({ animated: true });
  }, [keyboardHeight]);

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      statusBarTranslucent
      visible={visible}>
      <View onLayout={onLayout} style={[styles.screen, { paddingTop: topRoom }]}>
        <View style={styles.header}>
          <Pressable accessibilityLabel="Close chat" accessibilityRole="button" hitSlop={8} onPress={onClose} style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
            <Ionicons color={rider.colors.ink} name="chevron-down" size={22} />
          </Pressable>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{shownName.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={styles.headerText}>
            <Text numberOfLines={1} style={styles.name}>{shownName}</Text>
            <Text numberOfLines={1} style={styles.sub}>
              {chatOpen ? `Your ${otherWord} · Trip chat` : 'Trip ended · Chat closed'}
            </Text>
          </View>
          <BrandLogo size={32} />
        </View>

        <FlatList
          ref={listRef}
          contentContainerStyle={styles.messages}
          data={allMessages}
          keyboardShouldPersistTaps="handled"
          keyExtractor={(item) => item.id}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            <View style={styles.empty}>
              <BrandLogo size={56} />
              <Text style={styles.emptyTitle}>Say hello to {shownName}</Text>
              <Text style={styles.emptyText}>
                Messages here stay between you and your {otherWord}. Wheelers keeps a copy for your safety.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const time = new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            if (item.kind === 'call') {
              return (
                <View style={styles.lineRow}>
                  <Text style={styles.line}>{item.content} · {time}</Text>
                </View>
              );
            }
            const self = isSelf(item);
            return (
              <View style={self ? styles.mine : styles.theirs}>
                <Text style={self ? styles.mineText : styles.theirsText}>{item.content}</Text>
                <Text style={self ? styles.mineTime : styles.theirsTime}>{time}</Text>
              </View>
            );
          }}
        />

        {chatOpen ? null : (
          <View style={styles.closed}>
            <Ionicons color={rider.colors.muted} name="lock-closed" size={14} />
            <Text style={styles.closedText}>This trip has ended, so the chat is closed.</Text>
          </View>
        )}

        <View style={[styles.composer, { paddingBottom: bottomRoom }]}>
          <TextInput
            accessibilityLabel="Message"
            editable={chatOpen}
            maxLength={1000}
            multiline
            onChangeText={setDraft}
            placeholder={chatOpen ? `Message ${shownName}` : 'Chat closed'}
            placeholderTextColor="#8C837A"
            style={[styles.input, !chatOpen && styles.inputOff]}
            value={draft}
          />
          <Pressable
            accessibilityLabel="Send"
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSend }}
            disabled={!canSend}
            onPress={() => void handleSend()}
            style={({ pressed }) => [styles.send, !canSend && styles.sendOff, pressed && styles.pressed]}>
            <Ionicons color={rider.colors.ink} name="send" size={20} />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const bubble = { maxWidth: '82%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 } as const;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: rider.colors.cream },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: rider.colors.line,
    backgroundColor: rider.colors.cream,
  },
  close: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: rider.colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: rider.colors.orange, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: rider.fonts.display, fontSize: 20, color: rider.colors.ink },
  headerText: { flex: 1, minWidth: 0 },
  name: { fontFamily: rider.fonts.display, fontSize: 20, lineHeight: 24, color: rider.colors.ink },
  sub: { fontFamily: rider.fonts.medium, fontSize: 13, lineHeight: 17, color: rider.colors.muted },
  messages: { flexGrow: 1, paddingHorizontal: 16, paddingVertical: 14, gap: 8 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 24, paddingVertical: 40 },
  emptyTitle: { fontFamily: rider.fonts.display, fontSize: 22, lineHeight: 27, color: rider.colors.ink, textAlign: 'center' },
  emptyText: { fontFamily: rider.fonts.regular, fontSize: 15, lineHeight: 21, color: rider.colors.muted, textAlign: 'center' },
  lineRow: { alignItems: 'center' },
  line: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: rider.colors.tint,
    fontFamily: rider.fonts.medium,
    fontSize: 12,
    color: rider.colors.muted,
  },
  mine: { ...bubble, alignSelf: 'flex-end', borderTopRightRadius: 4, backgroundColor: rider.colors.ink },
  mineText: { fontFamily: rider.fonts.regular, fontSize: 15, lineHeight: 21, color: rider.colors.cream },
  mineTime: { fontFamily: rider.fonts.medium, fontSize: 11, color: rider.colors.onInkMuted, alignSelf: 'flex-end', marginTop: 2 },
  theirs: { ...bubble, alignSelf: 'flex-start', borderTopLeftRadius: 4, backgroundColor: rider.colors.card, borderWidth: 1, borderColor: rider.colors.line },
  theirsText: { fontFamily: rider.fonts.regular, fontSize: 15, lineHeight: 21, color: rider.colors.ink },
  theirsTime: { fontFamily: rider.fonts.medium, fontSize: 11, color: rider.colors.muted, alignSelf: 'flex-end', marginTop: 2 },
  closed: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: rider.colors.tint,
  },
  closedText: { fontFamily: rider.fonts.medium, fontSize: 13, color: rider.colors.muted },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 16,
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
  inputOff: { borderColor: rider.colors.line, backgroundColor: rider.colors.tint },
  send: { width: 48, height: 48, borderRadius: 24, backgroundColor: rider.colors.orange, alignItems: 'center', justifyContent: 'center' },
  sendOff: { opacity: 0.4 },
  pressed: { opacity: 0.75 },
});
