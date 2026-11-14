import { Href, useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, OnLight } from '@/components/app-text';
import { useDriverSession } from '@/lib/driver-session';
import { theme } from '@/theme';

/**
 * On Feed and Stations: ride requests and the trip live on Drive, so a driver
 * reading here is never left not knowing one came in. Nothing when there is none.
 */
export function RequestBanner() {
  const router = useRouter();
  const { session } = useDriverSession();
  const requests = session.offers.length;
  const onTrip = Boolean(session.currentRide);
  if (!onTrip && requests === 0) return null;
  const text = onTrip ? 'Trip in progress' : requests === 1 ? '1 ride request' : `${requests} ride requests`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${text}. Open Drive`}
      onPress={() => router.navigate((onTrip ? '/driver/(tabs)/home' : '/driver/(tabs)/active') as Href)}
      style={({ pressed }) => [styles.banner, pressed && { opacity: 0.8 }]}>
      <OnLight>
        <View style={styles.dot} />
        <AppText variant="label" style={styles.text} numberOfLines={1}>{text}</AppText>
        <AppText variant="label" numberOfLines={1}>Open  ›</AppText>
      </OnLight>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.orange,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.black },
  text: { flex: 1 },
});
