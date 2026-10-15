import { StyleSheet, View } from 'react-native';

import { AppCard } from '@/components/app-card';
import { AppText } from '@/components/app-text';
import { DriverDocument } from '@/data/mock';
import { theme } from '@/theme';

type DocumentStatusRowProps = {
  item: DriverDocument;
};

export function DocumentStatusRow({ item }: DocumentStatusRowProps) {
  const approved = item.status === 'approved';
  const pending = item.status === 'pending';

  return (
    <AppCard
      backgroundColor={pending ? '#F5F5F0' : theme.colors.white}
      borderColor={pending ? theme.colors.borderLight : theme.colors.black}
      style={[styles.card, pending ? styles.pendingCard : null]}>
      <View
        style={[
          styles.iconBox,
          approved ? styles.approvedIconBox : null,
          pending ? styles.pendingIconBox : null,
        ]}>
        <AppText variant="body">{item.icon}</AppText>
      </View>
      <View style={styles.copy}>
        <AppText variant="label" color={pending ? '#AAA39C' : theme.colors.black}>
          {item.title}
        </AppText>
        <AppText variant="bodySmall" color={pending ? '#CAC2BB' : theme.colors.muted}>
          {item.subtitle}
        </AppText>
      </View>
      <View
        style={[
          styles.badge,
          approved ? styles.approvedBadge : null,
          pending ? styles.pendingBadge : null,
        ]}>
        <AppText
          variant="monoSmall"
          color={approved ? theme.colors.green : pending ? '#9E958D' : theme.colors.orange}>
          {item.status.toUpperCase()}
        </AppText>
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  pendingCard: {
    shadowOpacity: 0,
    elevation: 0,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: theme.radii.sm,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approvedIconBox: {
    backgroundColor: theme.colors.successLight,
    borderColor: theme.colors.green,
  },
  pendingIconBox: {
    backgroundColor: theme.colors.white,
    borderColor: theme.colors.borderLight,
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  badge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 5,
    borderRadius: theme.radii.xs,
    borderWidth: theme.borders.regular,
  },
  approvedBadge: {
    backgroundColor: theme.colors.successLight,
    borderColor: theme.colors.green,
  },
  pendingBadge: {
    backgroundColor: '#EEE7E0',
    borderColor: theme.colors.borderLight,
  },
});
