import { Pressable, StyleSheet } from 'react-native';

import { AppText, OnLight } from '@/components/app-text';
import { DriverDocument } from '@/data/mock';
import { theme } from '@/theme';

type DocumentUploadCardProps = {
  item: DriverDocument;
  onPress?: () => void;
};

export function DocumentUploadCard({ item, onPress }: DocumentUploadCardProps) {
  return (
    <Pressable onPress={onPress} style={styles.card}>
      <OnLight>
      <AppText variant="metric" color={theme.colors.orange} style={styles.icon}>
        {item.icon}
      </AppText>
      <AppText variant="label" color={theme.colors.orange}>
        {item.title}
      </AppText>
      <AppText variant="bodySmall" color={theme.colors.muted} style={styles.subtitle}>
        {item.subtitle}
      </AppText>
      </OnLight>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: theme.borders.thick,
    borderStyle: 'dashed',
    borderColor: theme.colors.orange,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.orangeLight,
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.xl,
  },
  icon: {
    marginBottom: theme.spacing.xs,
  },
  subtitle: {
    textAlign: 'center',
    marginTop: 2,
  },
});
