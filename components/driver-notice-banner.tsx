import { useEffect } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/app-text';
import { clearDriverNotice, useDriverNotice } from '@/lib/driver-notice';
import { theme } from '@/theme';

const SHOW_MS = 4_000;

/** The driver's short notice ("Rider cancelled · Akoka"): on top of any screen, gone after 4s or a tap. */
export function DriverNoticeBanner() {
  const notice = useDriverNotice();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!notice) return;
    AccessibilityInfo.announceForAccessibility(notice.text);
    const timer = setTimeout(() => clearDriverNotice(notice.id), SHOW_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  if (!notice) return null;
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + theme.spacing.sm }]}>
      <Pressable
        onPress={() => clearDriverNotice(notice.id)}
        accessibilityRole="button"
        accessibilityLabel={`${notice.text}. Tap to close`}
        accessibilityLiveRegion="polite"
        style={styles.pill}
      >
        <View style={styles.dot} />
        <AppText variant="bodyMedium" color={theme.colors.offWhite} numberOfLines={1} style={styles.text}>
          {notice.text}
        </AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: theme.spacing.lg,
    right: theme.spacing.lg,
    alignItems: 'center',
    zIndex: 900,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    maxWidth: '100%',
    minHeight: 44,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.black,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.danger,
  },
  text: {
    flexShrink: 1,
  },
});
