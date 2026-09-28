import { useState } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/components/app-text';
import { RideChat } from '@/components/RideChat';
import { useTripChatOpenRequests, useTripChatUnread } from '@/lib/trip-chat';
import { theme } from '@/theme';

type Line = {
  id: string;
  rideId: string;
  senderId: string;
  senderRole: 'RIDER' | 'DRIVER';
  content: string;
  kind?: 'text' | 'call';
  createdAt: string;
};

type TripChatButtonProps = {
  rideId: string;
  role: 'RIDER' | 'DRIVER';
  messages: Line[];
  onSend: (rideId: string, content: string) => Promise<void>;
  otherName?: string | null;
  /** "pill": a labelled button in a row. "fab": the round button over a map. */
  variant?: 'pill' | 'fab';
  style?: StyleProp<ViewStyle>;
};

/**
 * "Chat", with how many messages are waiting, and the chat itself. A tapped
 * chat push opens it on whichever trip screen is showing.
 */
export function TripChatButton({ rideId, role, messages, onSend, otherName, variant = 'pill', style }: TripChatButtonProps) {
  const [open, setOpen] = useState(false);
  const unread = useTripChatUnread(messages, rideId, role);
  useTripChatOpenRequests(rideId, () => setOpen(true));

  return (
    <>
      <Pressable
        accessibilityLabel={unread > 0 ? `Chat, ${unread} unread` : 'Chat'}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [variant === 'fab' ? styles.fab : styles.pill, pressed && styles.pressed, style]}>
        {variant === 'fab' ? (
          <AppText style={styles.fabIcon}>💬</AppText>
        ) : (
          <AppText variant="label">Chat</AppText>
        )}
        {unread > 0 ? (
          <View style={[styles.badge, variant === 'fab' && styles.badgeFab]}>
            <AppText variant="monoSmall" color={theme.colors.white}>{unread > 9 ? '9+' : unread}</AppText>
          </View>
        ) : null}
      </Pressable>
      <RideChat
        visible={open}
        onClose={() => setOpen(false)}
        rideId={rideId}
        realtimeMessages={messages}
        onSend={onSend}
        userRole={role}
        otherName={otherName}
      />
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    minHeight: 44,
    paddingHorizontal: theme.spacing.lg,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
    ...theme.shadows.card,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: theme.radii.pill,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadows.card,
  },
  fabIcon: {
    fontSize: 24,
  },
  pressed: {
    opacity: 0.8,
  },
  badge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: theme.colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeFab: {
    position: 'absolute',
    top: -4,
    right: -4,
  },
});
