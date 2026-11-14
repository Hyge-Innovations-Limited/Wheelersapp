import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, type DimensionValue } from 'react-native';

import { useAppTheme } from '@/lib/theme-context';
import { theme } from '@/theme';

/**
 * Grey shapes where the Feed or Stations will be, gently pulsing while they
 * load (as X does), instead of a spinner. Every shape on screen pulses
 * together from one shared value.
 */
function usePulse() {
  const pulse = useRef(new Animated.Value(0.55)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.55, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return pulse;
}

function Bone({ width, height, radius = 6, tone }: { width: DimensionValue; height: number; radius?: number; tone: string }) {
  return <View style={{ width, height, borderRadius: radius, backgroundColor: tone }} />;
}

function useTones() {
  const { isDark } = useAppTheme();
  return {
    card: isDark ? theme.colors.darkSurface : theme.colors.white,
    border: isDark ? theme.colors.darkBorder : theme.colors.borderLight,
    bone: isDark ? theme.colors.darkSurfaceSoft : '#EFEAE1',
  };
}

export function FeedSkeleton({ count = 3 }: { count?: number }) {
  const pulse = usePulse();
  const t = useTones();
  return (
    <Animated.View accessibilityLabel="Loading posts" accessible style={{ gap: 12, opacity: pulse }}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}>
          <View style={styles.row}>
            <Bone width={36} height={36} radius={18} tone={t.bone} />
            <View style={{ flex: 1, gap: 6 }}>
              <Bone width="42%" height={12} tone={t.bone} />
              <Bone width="24%" height={10} tone={t.bone} />
            </View>
          </View>
          <Bone width="92%" height={12} tone={t.bone} />
          <Bone width={i % 2 ? '58%' : '74%'} height={12} tone={t.bone} />
          {i === 1 ? <Bone width="100%" height={150} radius={12} tone={t.bone} /> : null}
          <Bone width={58} height={28} radius={14} tone={t.bone} />
        </View>
      ))}
    </Animated.View>
  );
}

export function StationsSkeleton({ count = 4 }: { count?: number }) {
  const pulse = usePulse();
  const t = useTones();
  return (
    <Animated.View accessibilityLabel="Loading stations" accessible style={[styles.list, { borderColor: t.border, backgroundColor: t.card, opacity: pulse }]}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[styles.station, i > 0 && { borderTopWidth: 1, borderTopColor: t.border }]}>
          <Bone width={40} height={40} radius={12} tone={t.bone} />
          <View style={{ flex: 1, gap: 6 }}>
            <Bone width="55%" height={12} tone={t.bone} />
            <Bone width="38%" height={10} tone={t.bone} />
          </View>
          <Bone width={38} height={38} radius={19} tone={t.bone} />
        </View>
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10, padding: 12, borderRadius: theme.radii.md, borderWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  list: { borderRadius: theme.radii.md, borderWidth: 1, overflow: 'hidden' },
  station: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
});
