import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/components/app-text';
import { getRideChatMessages } from '@/lib/api';
import { useCachedQuery } from '@/lib/cached-query';
import { useLiveCall } from '@/lib/live-call/call-session';
import { theme } from '@/theme';

type TripCallButtonProps = {
  rideId: string;
  /** Who is being called: the rider calls the DRIVER, the driver calls the RIDER. */
  otherRole: 'RIDER' | 'DRIVER';
  otherName?: string | null;
  variant?: 'pill' | 'fab';
  style?: StyleProp<ViewStyle>;
};

/**
 * "Live call": a voice call through Wheelers. Shown only when this build has
 * the calling code, the server has calls on, and the trip's chat is open.
 */
export function TripCallButton({ rideId, otherRole, otherName, variant = 'pill', style }: TripCallButtonProps) {
  const { supported, call, startCall } = useLiveCall();
  // Whether calls are on and the chat is open: the chat's own answer, checked every few minutes.
  const status = useCachedQuery({
    key: `trip-chat.status.${rideId}`,
    fetcher: (accessToken) => getRideChatMessages({ accessToken, rideId, limit: 1 }),
    staleMs: 3 * 60 * 1000,
    storage: 'memory',
    enabled: supported,
  });
  if (!supported || !status.data?.callsEnabled || status.data.open === false) return null;

  return (
    <Pressable
      accessibilityLabel="Live call"
      disabled={Boolean(call)}
      onPress={() => void startCall({ rideId, otherName, otherRole })}
      style={({ pressed }) => [variant === 'fab' ? styles.fab : styles.pill, pressed && styles.pressed, call && styles.busy, style]}>
      {variant === 'fab' ? <AppText style={styles.fabIcon}>📞</AppText> : <AppText variant="label">Live call</AppText>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    minHeight: 44,
    paddingHorizontal: theme.spacing.lg,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadows.card,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: theme.radii.pill,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadows.card,
  },
  fabIcon: { fontSize: 24 },
  pressed: { opacity: 0.8 },
  busy: { opacity: 0.5 },
});
