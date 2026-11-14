import { Href, useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';
import Svg, { Line, Polyline } from 'react-native-svg';

import { useResponsive } from '@/lib/responsive';
import { useAppTheme } from '@/lib/theme-context';
import { theme } from '@/theme';

/**
 * The driver app's one back button (Timi, 14 Nov 2026): the bordered square
 * with an arrow, as on Profile, Earnings and Withdraw. Back where there is a
 * screen to go back to; otherwise `fallback` (a screen opened from a push).
 */
export function BackButton({ fallback, onPress }: { fallback?: string; onPress?: () => void }) {
  const router = useRouter();
  const responsive = useResponsive();
  const { isDark } = useAppTheme();
  const size = responsive.scale(40);
  const glyph = responsive.scale(22);
  return (
    <Pressable
      accessibilityLabel="Back"
      accessibilityRole="button"
      hitSlop={12}
      onPress={() => {
        if (onPress) { onPress(); return; }
        if (router.canGoBack()) router.back();
        else if (fallback) router.replace(fallback as Href);
      }}
      style={({ pressed }) => [
        styles.button,
        { width: size, height: size },
        isDark && { backgroundColor: theme.colors.darkSurface, borderColor: theme.colors.darkBorder },
        pressed && { opacity: 0.7 },
      ]}>
      <Svg width={glyph} height={glyph} viewBox="0 0 24 24" fill="none" stroke={isDark ? theme.colors.offWhite : theme.colors.black} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <Line x1="19" y1="12" x2="5" y2="12" />
        <Polyline points="12 19 5 12 12 5" />
      </Svg>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexShrink: 0,
    borderRadius: theme.radii.xs,
    backgroundColor: theme.colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.borderLight,
    ...theme.shadows.subtle,
  },
});
