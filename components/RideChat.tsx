import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { AppText } from '@/components/app-text';
import { ChatComposer } from '@/components/ChatComposer';
import { useAuth } from '@/lib/auth';
import { getAccessTokenWithRetry } from '@/lib/access-token';
import { getRideChatMessages, type ChatMessageResponse } from '@/lib/api';
import { markTripChatSeen, setOpenTripChat } from '@/lib/trip-chat';
import { theme } from '@/theme';

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
  const [chatOpen, setChatOpen] = useState(true);
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

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible={visible}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}>
        <View style={styles.header}>
          <AppText variant="h3" numberOfLines={1} style={styles.title}>
            {firstName ? `Chat with ${firstName}` : userRole === 'DRIVER' ? 'Chat with your rider' : 'Chat with your driver'}
          </AppText>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <AppText variant="bodyMedium">Close</AppText>
          </Pressable>
        </View>

        <FlatList
          ref={listRef}
          data={allMessages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messageList}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            <AppText variant="bodySmall" color={theme.colors.muted} style={styles.empty}>
              Messages here stay between you and your {userRole === 'DRIVER' ? 'rider' : 'driver'}. Wheelers keeps a copy for your safety.
            </AppText>
          }
          renderItem={({ item }) => {
            const time = new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            if (item.kind === 'call') {
              return (
                <View style={styles.lineRow}>
                  <AppText variant="monoSmall" color={theme.colors.muted} style={styles.line}>
                    {item.content} · {time}
                  </AppText>
                </View>
              );
            }
            const self = isSelf(item);
            return (
              <View style={[styles.bubbleRow, self ? styles.rowEnd : styles.rowStart]}>
                <View style={[styles.bubble, self ? styles.selfBubble : styles.otherBubble]}>
                  <AppText
                    variant="bodySmall"
                    color={self ? theme.colors.white : theme.colors.black}
                    style={styles.messageText}>
                    {item.content}
                  </AppText>
                  <AppText
                    variant="monoSmall"
                    color={self ? 'rgba(255,255,255,0.68)' : theme.colors.mutedLight}>
                    {time}
                  </AppText>
                </View>
              </View>
            );
          }}
        />

        {chatOpen ? null : (
          <View style={styles.closedBanner}>
            <AppText variant="bodySmall" color={theme.colors.muted}>
              This chat has ended. It closes 30 minutes after the trip.
            </AppText>
          </View>
        )}
        <ChatComposer
          value={draft}
          onChangeText={setDraft}
          onSend={handleSend}
          editable={chatOpen}
          placeholder={chatOpen ? 'Type a message...' : 'Chat closed'}
        />
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.offWhite,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.gutter,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
    borderBottomWidth: theme.borders.thick,
    borderBottomColor: theme.colors.black,
  },
  title: {
    flex: 1,
  },
  closeButton: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  messageList: {
    paddingHorizontal: theme.spacing.gutter,
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  empty: {
    textAlign: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
  },
  lineRow: {
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  line: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 4,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.white,
    overflow: 'hidden',
  },
  bubbleRow: {
    flexDirection: 'row',
    marginBottom: theme.spacing.xs,
  },
  rowStart: {
    justifyContent: 'flex-start',
  },
  rowEnd: {
    justifyContent: 'flex-end',
  },
  bubble: {
    maxWidth: '78%',
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    gap: 4,
    ...theme.shadows.card,
  },
  selfBubble: {
    backgroundColor: theme.colors.orange,
    borderTopLeftRadius: theme.radii.sm,
    borderTopRightRadius: theme.radii.sm,
    borderBottomLeftRadius: theme.radii.sm,
    borderBottomRightRadius: 2,
  },
  otherBubble: {
    backgroundColor: theme.colors.white,
    borderTopLeftRadius: theme.radii.sm,
    borderTopRightRadius: theme.radii.sm,
    borderBottomRightRadius: theme.radii.sm,
    borderBottomLeftRadius: 2,
  },
  messageText: {
    lineHeight: 19,
  },
  closedBanner: {
    alignItems: 'center',
    paddingHorizontal: theme.spacing.gutter,
    paddingVertical: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.black,
  },
});
