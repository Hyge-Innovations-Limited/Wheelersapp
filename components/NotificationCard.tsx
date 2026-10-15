import { StyleSheet, View } from 'react-native';

import { AppCard } from '@/components/app-card';
import { AppText } from '@/components/app-text';
import { NotificationItem } from '@/data/mock';
import { theme } from '@/theme';

type NotificationCardProps = {
  item: NotificationItem;
};

export function NotificationCard({ item }: NotificationCardProps) {
  const unread = Boolean(item.unread);
  const iconBackground =
    item.accent === 'green'
      ? theme.colors.green
      : item.accent === 'black'
        ? theme.colors.black
        : theme.colors.orange;

  return (
    <AppCard
      backgroundColor={unread ? theme.colors.orangeLight : '#F5F2ED'}
      borderColor={unread ? theme.colors.orange : theme.colors.borderLight}
      style={[
        styles.card,
        unread ? styles.unreadCard : styles.readCard,
        unread ? { shadowColor: theme.colors.orange } : null,
      ]}>
      <View style={[styles.iconWrap, unread ? styles.activeIconWrap : styles.mutedIconWrap]}>
        <View style={[styles.iconCircle, { backgroundColor: iconBackground }]}>
          <AppText variant="h3" color={theme.colors.white}>
            {item.icon}
          </AppText>
        </View>
      </View>
      <View style={styles.copy}>
        <AppText variant="label" color={unread ? theme.colors.black : '#66615B'}>
          {item.title}
        </AppText>
        <AppText variant="bodySmall" color={unread ? theme.colors.muted : theme.colors.mutedLight}>
          {item.message}
        </AppText>
        <AppText variant="monoSmall" color={unread ? theme.colors.mutedLight : '#CAC2BB'}>
          {item.timestamp}
        </AppText>
      </View>
      {unread ? <View style={styles.unreadDot} /> : null}
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
  },
  unreadCard: {
    paddingRight: theme.spacing.xl,
  },
  readCard: {
    shadowOpacity: 0,
    elevation: 0,
  },
  iconWrap: {
    paddingTop: 2,
  },
  activeIconWrap: {
    opacity: 1,
  },
  mutedIconWrap: {
    opacity: 0.6,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: theme.radii.pill,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  unreadDot: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 10,
    height: 10,
    borderRadius: theme.radii.pill,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.orange,
  },
});
