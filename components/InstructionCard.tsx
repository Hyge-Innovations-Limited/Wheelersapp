import { StyleSheet, View } from 'react-native';

import { AppCard } from '@/components/app-card';
import { AppText } from '@/components/app-text';
import { RouteInstruction } from '@/data/mock';
import { theme } from '@/theme';

type InstructionCardProps = {
  instruction: RouteInstruction;
  variant?: 'card' | 'banner';
};

export function InstructionCard({
  instruction,
  variant = 'card',
}: InstructionCardProps) {
  const compact = variant === 'banner';

  return (
    <AppCard style={[styles.card, compact ? styles.banner : null]}>
      <View style={[styles.iconWrap, compact ? styles.iconWrapCompact : null]}>
        <AppText style={styles.icon}>{instruction.icon}</AppText>
      </View>
      <View style={styles.copy}>
        <AppText variant="h3" style={compact ? styles.bannerTitle : undefined}>
          {instruction.title}
        </AppText>
        <AppText variant="bodySmall" color={theme.colors.muted}>
          {instruction.subtitle}
        </AppText>
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  banner: {
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radii.sm,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: theme.radii.sm,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.orange,
    backgroundColor: theme.colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapCompact: {
    width: 34,
    height: 34,
  },
  icon: {
    fontSize: 18,
    color: theme.colors.offWhite,
  },
  copy: {
    flex: 1,
    gap: 1,
  },
  bannerTitle: {
    fontSize: 15,
    lineHeight: 18,
  },
});
