import { PropsWithChildren } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { isLightColor, OnLight } from '@/components/app-text';
import { useAppTheme } from '@/lib/theme-context';
import { theme } from '@/theme';

type AppCardProps = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  backgroundColor?: string;
  borderColor?: string;
}>;

export function AppCard({
  children,
  style,
  backgroundColor,
  borderColor,
}: AppCardProps) {
  const { isDark } = useAppTheme();
  const bg = backgroundColor ?? (isDark ? theme.colors.darkSurface : theme.colors.white);
  const border = borderColor ?? (isDark ? theme.colors.darkBorder : theme.colors.borderLight);
  return (
    <View style={[styles.card, { backgroundColor: bg, borderColor: border }, style]}>
      {/* A card given a light background keeps dark text on it in dark mode too. */}
      {isDark && isLightColor(bg) ? <OnLight>{children}</OnLight> : children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    ...theme.shadows.card,
  },
});
