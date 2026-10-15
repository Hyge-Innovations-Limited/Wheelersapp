import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { AppText } from '@/components/app-text';
import { theme } from '@/theme';

type Variant = 'orange' | 'green' | 'dark' | 'light' | 'outline';

type StatusPillProps = {
  label: string;
  variant?: Variant;
  dotColor?: string;
  style?: StyleProp<ViewStyle>;
};

const variants = {
  orange: {
    backgroundColor: theme.colors.orangeLight,
    borderColor: theme.colors.orange,
    textColor: theme.colors.orange,
  },
  green: {
    backgroundColor: '#E8FFF7',
    borderColor: theme.colors.green,
    textColor: theme.colors.green,
  },
  dark: {
    backgroundColor: theme.colors.black,
    borderColor: theme.colors.black,
    textColor: theme.colors.offWhite,
  },
  light: {
    backgroundColor: theme.colors.white,
    borderColor: theme.colors.borderLight,
    textColor: theme.colors.black,
  },
  outline: {
    backgroundColor: 'transparent',
    borderColor: theme.colors.borderLight,
    textColor: theme.colors.black,
  },
} as const;

export function StatusPill({
  label,
  variant = 'orange',
  dotColor,
  style,
}: StatusPillProps) {
  const colors = variants[variant];

  return (
    <View
      style={[
        styles.pill,
        {
          backgroundColor: colors.backgroundColor,
          // Transparent pills would cast a hard shadow of their own text.
          ...(colors.backgroundColor === 'transparent'
            ? { shadowOpacity: 0, elevation: 0 }
            : null),
          borderColor: colors.borderColor,
        },
        style,
      ]}>
      {dotColor ? <View style={[styles.dot, { backgroundColor: dotColor }]} /> : null}
      <AppText variant="monoSmall" color={colors.textColor}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    borderWidth: theme.borders.regular,
    borderRadius: theme.radii.sm,
    ...theme.shadows.subtle,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: theme.radii.pill,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.black,
  },
});
