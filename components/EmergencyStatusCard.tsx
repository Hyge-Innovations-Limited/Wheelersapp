import { StyleSheet, View } from 'react-native';

import { AppCard } from '@/components/app-card';
import { AppText, OnLight } from '@/components/app-text';
import { EmergencyStatus } from '@/data/mock';
import { theme } from '@/theme';

type EmergencyStatusCardProps = {
  status: EmergencyStatus;
};

export function EmergencyStatusCard({ status }: EmergencyStatusCardProps) {
  const live = status.tone === 'live';

  return (
    <AppCard style={styles.card}>
      <View style={[styles.iconBox, live ? styles.liveIconBox : styles.pendingIconBox]}>
        <AppText variant="body">{status.icon}</AppText>
      </View>
      <View style={styles.copy}>
        <AppText variant="label">{status.title}</AppText>
        <AppText variant="bodySmall" color={live ? theme.colors.green : theme.colors.muted}>
          {status.detail}
        </AppText>
      </View>
      {status.label ? (
        <View style={[styles.badge, styles.liveBadge]}>
          <OnLight>
          <AppText variant="monoSmall" color={theme.colors.green}>
            {status.label}
          </AppText>
          </OnLight>
        </View>
      ) : (
        <View style={styles.pendingDot} />
      )}
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: theme.radii.pill,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveIconBox: {
    backgroundColor: theme.colors.successLight,
  },
  pendingIconBox: {
    backgroundColor: theme.colors.orangeLight,
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
  liveBadge: {
    backgroundColor: theme.colors.successLight,
    borderColor: theme.colors.green,
  },
  pendingDot: {
    width: 10,
    height: 10,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.red,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.black,
  },
});
