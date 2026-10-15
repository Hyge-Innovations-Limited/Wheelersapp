import { useEffect, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { AppText } from '@/components/app-text';
import { theme } from '@/theme';

type TripProgressBarProps = {
  progress: number;
  label?: string;
  fillColor?: string;
};

export function TripProgressBar({
  progress,
  label,
  fillColor = theme.colors.orange,
}: TripProgressBarProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const animatedWidth = useSharedValue(0);
  const clamped = Math.max(0, Math.min(1, progress));

  useEffect(() => {
    if (trackWidth > 0) {
      animatedWidth.value = withTiming(trackWidth * clamped, {
        duration: 700,
      });
    }
  }, [animatedWidth, clamped, trackWidth]);

  const fillStyle = useAnimatedStyle(() => ({
    width: animatedWidth.value,
  }));

  const onLayout = (event: LayoutChangeEvent) => {
    setTrackWidth(event.nativeEvent.layout.width);
  };

  return (
    <View style={styles.wrap}>
      {label ? (
        <AppText variant="bodySmall" color={theme.colors.muted}>
          {label}
        </AppText>
      ) : null}
      <View onLayout={onLayout} style={styles.track}>
        <Animated.View style={[styles.fill, { backgroundColor: fillColor }, fillStyle]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: theme.spacing.xs,
  },
  track: {
    height: 12,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.borderLight,
    borderRadius: theme.radii.pill,
    backgroundColor: '#F0EDE8',
    overflow: 'hidden',
    ...theme.shadows.card,
  },
  fill: {
    height: '100%',
    backgroundColor: theme.colors.orange,
    borderRadius: theme.radii.pill,
  },
});
