import { Pressable, StyleSheet, View } from 'react-native';

import { AppCard } from '@/components/app-card';
import { AppText } from '@/components/app-text';
import { RoleMode } from '@/data/mock';
import { StatusPill } from '@/components/StatusPill';
import { theme } from '@/theme';

type ModeSwitchCardProps = {
  role: RoleMode;
  active?: boolean;
  target?: boolean;
  onPress?: () => void;
};

export function ModeSwitchCard({ role, active, target, onPress }: ModeSwitchCardProps) {
  const dark = Boolean(target);

  const card = (
    <AppCard
      backgroundColor={dark ? theme.colors.black : theme.colors.white}
      borderColor={theme.colors.black}
      style={[styles.card, dark ? styles.targetCard : null]}>
      <View style={[styles.iconCircle, dark ? styles.targetIconCircle : styles.activeIconCircle]}>
        <AppText variant="h2">{role.icon}</AppText>
      </View>
      <View style={styles.copy}>
        <AppText variant="label" color={dark ? theme.colors.white : theme.colors.black}>
          {role.title}
        </AppText>
        <AppText variant="bodySmall" color={active ? theme.colors.green : dark ? theme.colors.darkMuted : theme.colors.muted}>
          {role.subtitle}
        </AppText>
      </View>
      <StatusPill label={active ? 'ON' : 'OFF'} variant={active ? 'green' : dark ? 'dark' : 'outline'} />
    </AppCard>
  );

  if (onPress) {
    return <Pressable onPress={onPress}>{card}</Pressable>;
  }

  return card;
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  targetCard: {
    shadowColor: theme.colors.orange,
    backgroundColor: theme.colors.black,
  },
  iconCircle: {
    width: 46,
    height: 46,
    borderRadius: theme.radii.pill,
    borderWidth: theme.borders.thick,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeIconCircle: {
    backgroundColor: theme.colors.orangeLight,
    borderColor: theme.colors.borderLight,
  },
  targetIconCircle: {
    backgroundColor: '#222',
    borderColor: '#444',
  },
  copy: {
    flex: 1,
    gap: 2,
  },
});
