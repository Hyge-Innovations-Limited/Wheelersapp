import { useRouter, useSegments } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { BackButton } from '@/components/back-button';
import { ProgressDots } from '@/components/progress-dots';
import { theme } from '@/theme';

type FlowHeaderProps = {
  overline?: string;
  title: string;
  subtitle?: string;
  showBack?: boolean;
  backHref?: string;
  align?: 'left' | 'center';
  progress?: {
    count: number;
    active: number;
    dark?: boolean;
  };
  light?: boolean;
};

export function FlowHeader({
  overline,
  title,
  subtitle,
  showBack,
  backHref,
  align = 'left',
  progress,
  light,
}: FlowHeaderProps) {
  const router = useRouter();
  // The driver app has one back button everywhere (components/back-button.tsx); the rest keep the arrow.
  const inDriverApp = (useSegments() as string[])[0] === 'driver';
  const accent = light ? theme.colors.offWhite : theme.colors.black;
  const muted = light ? '#8F8A86' : theme.colors.muted;
  const isCentered = align === 'center';

  return (
    <View style={[styles.wrapper, isCentered ? styles.wrapperCentered : null]}>
      <View style={[styles.topRow, isCentered ? styles.topRowCentered : null]}>
        <View style={styles.backSlot}>
          {showBack && inDriverApp && !light ? (
            <BackButton fallback={backHref} />
          ) : showBack ? (
            <Pressable
              onPress={() => {
                if (router.canGoBack()) {
                  router.back();
                  return;
                }

                if (backHref) {
                  router.replace(backHref as any);
                }
              }}
              style={styles.backButton}>
              <AppText variant="h3" color={accent}>
                ←
              </AppText>
            </Pressable>
          ) : null}
        </View>
        {progress ? (
          <ProgressDots
            count={progress.count}
            active={progress.active}
            activeColor={light ? theme.colors.orange : theme.colors.orange}
            inactiveColor={light ? '#2B2B2B' : theme.colors.offWhite}
          />
        ) : null}
      </View>
      {overline ? (
        <AppText
          variant="monoSmall"
          color={muted}
          style={[styles.overline, isCentered ? styles.textCentered : null]}>
          {overline}
        </AppText>
      ) : null}
      <AppText variant="h1" color={accent} style={isCentered ? styles.textCentered : null}>
        {title}
      </AppText>
      {subtitle ? (
        <AppText
          variant="bodySmall"
          color={muted}
          style={[styles.subtitle, isCentered ? styles.subtitleCentered : null]}>
          {subtitle}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: theme.spacing.sm,
  },
  wrapperCentered: {
    alignItems: 'center',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 32,
  },
  topRowCentered: {
    width: '100%',
  },
  backSlot: {
    minWidth: 32,
  },
  backButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overline: {
    letterSpacing: 1,
  },
  textCentered: {
    textAlign: 'center',
  },
  subtitle: {
    maxWidth: 300,
  },
  subtitleCentered: {
    textAlign: 'center',
  },
});
