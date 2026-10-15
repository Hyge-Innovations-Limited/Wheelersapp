import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { SupportMessage } from '@/data/mock';
import { theme } from '@/theme';

type ChatBubbleProps = {
  message?: SupportMessage;
  typing?: boolean;
  avatar?: string;
};

export function ChatBubble({ message, typing, avatar = '🤖' }: ChatBubbleProps) {
  const support = typing || message?.sender === 'support';

  return (
    <View style={[styles.row, support ? styles.rowStart : styles.rowEnd]}>
      {support ? (
        <View style={styles.avatar}>
          <AppText variant="bodySmall">{avatar}</AppText>
        </View>
      ) : null}
      <View style={[styles.bubble, support ? styles.supportBubble : styles.userBubble]}>
        {typing ? (
          <View style={styles.typingRow}>
            <View style={styles.typingDot} />
            <View style={[styles.typingDot, styles.typingDotMuted]} />
            <View style={styles.typingDot} />
          </View>
        ) : (
          <>
            <AppText
              variant="bodySmall"
              color={support ? theme.colors.black : theme.colors.white}
              style={styles.messageText}>
              {message?.text}
            </AppText>
            <AppText
              variant="monoSmall"
              color={support ? theme.colors.mutedLight : 'rgba(255,255,255,0.68)'}>
              {message?.timestamp}
            </AppText>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    alignItems: 'flex-end',
  },
  rowStart: {
    alignSelf: 'flex-start',
  },
  rowEnd: {
    alignSelf: 'flex-end',
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: theme.radii.pill,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.orange,
    backgroundColor: theme.colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadows.card,
  },
  bubble: {
    maxWidth: '78%',
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.borderLight,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    gap: 4,
    ...theme.shadows.card,
  },
  supportBubble: {
    backgroundColor: theme.colors.white,
    borderTopLeftRadius: theme.radii.sm,
    borderTopRightRadius: theme.radii.sm,
    borderBottomRightRadius: theme.radii.sm,
    borderBottomLeftRadius: 2,
  },
  userBubble: {
    backgroundColor: theme.colors.orange,
    borderTopLeftRadius: theme.radii.sm,
    borderTopRightRadius: theme.radii.sm,
    borderBottomLeftRadius: theme.radii.sm,
    borderBottomRightRadius: 2,
  },
  messageText: {
    lineHeight: 17,
  },
  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minWidth: 34,
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: theme.radii.pill,
    backgroundColor: '#C7C0BA',
  },
  typingDotMuted: {
    opacity: 0.45,
  },
});
