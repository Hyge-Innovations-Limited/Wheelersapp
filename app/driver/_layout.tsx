import { Stack } from 'expo-router';
import { DriverTripRouter } from '@/components/driver-trip-router';
import { DriverSessionProvider } from '@/lib/driver-session';
import { DriverLiveCallHost } from '@/lib/live-call/hosts';

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
      </DriverLiveCallHost>
    </DriverSessionProvider>
  );
}
