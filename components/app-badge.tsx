import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { theme } from '@/theme';

type Variant = 'orange' | 'green' | 'white' | 'dark';

type AppBadgeProps = {
  label: string;
  variant?: Variant;
};

const colors = {
  orange: {
    backgroundColor: theme.colors.orange,
    color: theme.colors.black,
    borderColor: theme.colors.orange,
  },
  green: {
    backgroundColor: theme.colors.green,
    color: theme.colors.offWhite,
    borderColor: theme.colors.green,
  },
  white: {
    backgroundColor: theme.colors.white,
    color: theme.colors.orange,
    borderColor: theme.colors.borderLight,
  },
  dark: {
    backgroundColor: theme.colors.black,
    color: theme.colors.offWhite,
    borderColor: theme.colors.black,
  },
} as const;

export function AppBadge({ label, variant = 'orange' }: AppBadgeProps) {
  const badge = colors[variant];

  return (
    <View style={[styles.badge, { backgroundColor: badge.backgroundColor, borderColor: badge.borderColor }]}>
      <AppText variant="monoSmall" color={badge.color}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
    borderWidth: theme.borders.regular,
    borderRadius: 999,
    paddingHorizontal: 10,
  },
});
