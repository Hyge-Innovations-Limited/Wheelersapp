import { PropsWithChildren, useEffect, useRef, useState, type ReactElement } from 'react';
import {
  LayoutChangeEvent,
  Platform,
  ScrollView,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
  type RefreshControlProps,
} from 'react-native';
import { Edge, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeyboardHeight } from '@/hooks/use-keyboard';
import { useResponsive } from '@/lib/responsive';
import { isLightColor, OnLight } from '@/components/app-text';
import { useAppTheme } from '@/lib/theme-context';
import { theme } from '@/theme';

type AppScreenProps = PropsWithChildren<{
  backgroundColor?: string;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  safeAreaEdges?: Edge[];
  refreshControl?: ReactElement<RefreshControlProps>;
  /** Extra room kept between the keyboard and the content below it. */
  keyboardOffset?: number;
  /** Set false for screens that must never move with the keyboard (maps). */
  avoidKeyboard?: boolean;
  /** Extra bottom padding — e.g. to clear a floating tab bar. */
  bottomInset?: number;
  bounces?: boolean;
}>;

export function AppScreen({
  children,
  backgroundColor,
  scroll,
  contentStyle,
  safeAreaEdges,
  refreshControl,
  keyboardOffset = 0,
  avoidKeyboard = true,
  bottomInset = 0,
  bounces,
}: AppScreenProps) {
  const { isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const responsive = useResponsive();
  const keyboardHeight = useKeyboardHeight();

  const resolvedBg = backgroundColor ?? (isDark ? theme.colors.black : theme.colors.offWhite);
  // A screen given a light background keeps dark text on it in dark mode too.
  const content = isDark && isLightColor(resolvedBg) ? <OnLight>{children}</OnLight> : children;

  // Some platforms (Android adjustResize, iPadOS) shrink the view themselves
  // when the keyboard opens. Compare the live height against the height we
  // last saw with the keyboard closed so we only ever add the shortfall —
  // never double-pad.
  const [viewportHeight, setViewportHeight] = useState(0);
  const baselineHeightRef = useRef(0);

  useEffect(() => {
    if (keyboardHeight === 0 && viewportHeight > 0) {
      baselineHeightRef.current = viewportHeight;
    }
  }, [keyboardHeight, viewportHeight]);

  const handleLayout = (event: LayoutChangeEvent) => {
    const { height } = event.nativeEvent.layout;
    setViewportHeight((current) => (Math.abs(current - height) > 1 ? height : current));
  };

  const consumesBottomInset = !safeAreaEdges || safeAreaEdges.includes('bottom');
  const alreadyShrunk =
    baselineHeightRef.current > 0 ? Math.max(0, baselineHeightRef.current - viewportHeight) : 0;

  // iOS ScrollViews handle this natively (inset + scroll-to-focused-input),
  // so we only compute a manual inset where the platform leaves a gap.
  const useNativeKeyboardInsets = scroll === true && Platform.OS === 'ios' && avoidKeyboard;

  const keyboardInset =
    avoidKeyboard && keyboardHeight > 0 && !useNativeKeyboardInsets
      ? Math.max(
          0,
          keyboardHeight - alreadyShrunk - (consumesBottomInset ? insets.bottom : 0),
        ) + keyboardOffset
      : 0;

  const containerStyle: StyleProp<ViewStyle> = [
    styles.content,
    {
      paddingHorizontal: responsive.gutter,
      maxWidth: responsive.isTablet ? theme.layout.maxWidth : undefined,
      paddingBottom: theme.spacing.xl + bottomInset + keyboardInset,
    },
    contentStyle,
    // Keyboard padding must win over any contentStyle paddingBottom.
    keyboardInset > 0 ? { paddingBottom: theme.spacing.xl + bottomInset + keyboardInset } : null,
  ];

  return (
    <SafeAreaView
      edges={safeAreaEdges}
      onLayout={handleLayout}
      style={[styles.safeArea, { backgroundColor: resolvedBg }]}>
      {scroll ? (
        <ScrollView
          automaticallyAdjustKeyboardInsets={useNativeKeyboardInsets}
          bounces={bounces ?? false}
          contentContainerStyle={containerStyle}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl}
          showsVerticalScrollIndicator={false}>
          {content}
        </ScrollView>
      ) : (
        <View style={containerStyle}>{content}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    overflow: 'hidden',
  },
  content: {
    flexGrow: 1,
    width: '100%',
    alignSelf: 'center',
    paddingBottom: theme.spacing.xl,
  },
});
