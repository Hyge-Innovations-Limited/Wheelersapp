import { useEffect, useRef } from 'react';
import { Alert, AppState, type AppStateStatus } from 'react-native';
import * as Updates from 'expo-updates';

/**
 * Over-the-air updates. expo-updates already downloads a new bundle on cold
 * launch and applies it on the NEXT launch; this hook closes the gap for an
 * app that stays open for days (a driver's does): it re-checks whenever the
 * app returns to the foreground and, once a bundle is downloaded, offers a
 * restart so the fix is live now rather than tomorrow.
 *
 * Never runs in development or in a build with updates disabled.
 */
export function useOtaUpdates(): void {
  const checkingRef = useRef(false);
  const offeredRef = useRef(false);

  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) return;

    const check = async () => {
      if (checkingRef.current || offeredRef.current) return;
      checkingRef.current = true;
      try {
        const result = await Updates.checkForUpdateAsync();
        if (!result.isAvailable) return;
        await Updates.fetchUpdateAsync();
        offeredRef.current = true;
        Alert.alert(
          'Update ready',
          'A new version of Wheelers has been downloaded. Restart to use it now?',
          [
            { text: 'Later', style: 'cancel', onPress: () => { offeredRef.current = false; } },
            { text: 'Restart', onPress: () => { void Updates.reloadAsync(); } },
          ],
        );
      } catch {
        // Offline, or the update server is unreachable — try again next time.
      } finally {
        checkingRef.current = false;
      }
    };

    void check();
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') void check();
    });
    return () => sub.remove();
  }, []);
}
