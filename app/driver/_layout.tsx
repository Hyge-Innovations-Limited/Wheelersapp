import { Stack } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { DriverTripRouter } from '@/components/driver-trip-router';
import { DriverSessionProvider } from '@/lib/driver-session';
import { DriverLiveCallHost } from '@/lib/live-call/hosts';
import { useDriverKycLock } from '@/lib/use-driver-kyc-lock';
import { theme } from '@/theme';

/** Covers any driver screen an unapproved driver lands on while the lock moves them to verification. */
function DriverKycLock() {
  const covered = useDriverKycLock();
  if (!covered) return null;
  return (
    <View style={styles.cover} pointerEvents="auto">
      <ActivityIndicator color={theme.colors.orange} />
    </View>
  );
}

export default function DriverLayout() {
  return (
    <DriverSessionProvider>
      <DriverLiveCallHost>
      <DriverTripRouter />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="incoming-request" options={{ presentation: 'modal' }} />
        <Stack.Screen name="pending-bid" options={{ presentation: 'modal' }} />
        <Stack.Screen name="navigation" />
        <Stack.Screen name="arrived" />
        <Stack.Screen name="active-trip" />
        <Stack.Screen name="earnings" />
        <Stack.Screen name="payout" />
        <Stack.Screen name="withdraw" />
        <Stack.Screen name="stellar" />
        <Stack.Screen name="stellar-send" />
        <Stack.Screen name="stellar-transfer" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="docs" />
      </Stack>
      <DriverKycLock />
      </DriverLiveCallHost>
    </DriverSessionProvider>
  );
}

const styles = StyleSheet.create({
  cover: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.offWhite,
    zIndex: 1000,
  },
});
