import { createContext, useContext, type ReactNode } from 'react';
import { StyleProp, StyleSheet, Text, TextProps, TextStyle } from 'react-native';

import { useAppTheme } from '@/lib/theme-context';
import { theme } from '@/theme';

type Variant = keyof typeof styles;

/**
 * Inside a card that stays white in dark mode. Text there keeps the dark ink:
 * without this, text with no colour of its own turned white in dark mode and
 * vanished on the white card ("Change bid" on Active).
 */
const OnLightCard = createContext(false);

export function OnLight({ children }: { children: ReactNode }) {
  return <OnLightCard.Provider value>{children}</OnLightCard.Provider>;
}

/** A light colour (white, cream, a pale tint): text on it must stay dark, dark mode or not. */
export function isLightColor(color: string | undefined | null): boolean {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(color ?? '').trim())?.[1];
  if (!hex) return /^(white|#fff)$/i.test(String(color ?? '').trim());
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 186;
}

type AppTextProps = TextProps & {
  variant?: Exclude<Variant, 'base'>;
  color?: string;
  style?: StyleProp<TextStyle>;
};

export function AppText({
  variant = 'body',
  color,
  style,
  maxFontSizeMultiplier = 1.25,
  ...props
}: AppTextProps) {
  const { isDark } = useAppTheme();
  const onLight = useContext(OnLightCard);
  const resolvedColor = color ?? (isDark && !onLight ? theme.colors.offWhite : theme.colors.black);
  return (
    <Text
      {...props}
      // Cap OS font scaling: past ~1.25x the bordered cards and metric rows
      // start clipping on small phones.
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      style={[styles.base, styles[variant], { color: resolvedColor }, style]}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    color: theme.colors.black,
    flexShrink: 1,
    maxWidth: '100%',
    includeFontPadding: false,
  },
  display: theme.typography.display,
  h1: theme.typography.h1,
  h2: theme.typography.h2,
  h3: theme.typography.h3,
  body: theme.typography.body,
  bodyMedium: theme.typography.bodyMedium,
  bodySmall: theme.typography.bodySmall,
  label: theme.typography.label,
  mono: theme.typography.mono,
  monoSmall: theme.typography.monoSmall,
  monoLarge: theme.typography.monoLarge,
  screenTitle: theme.typography.screenTitle,
  metric: theme.typography.metric,
  caption: theme.typography.caption,
});
