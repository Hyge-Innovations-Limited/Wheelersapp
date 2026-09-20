/**
 * "Nearby ride alerts" — a rough position while the driver is signed in but
 * OFF shift, so Wheelers can tell them about a rider close by.
 *
 * Strictly opt-in (Settings → Nearby ride alerts) and deliberately coarse:
 * kilometre-level accuracy, one fix every ten minutes or 500 m. It posts to
 * its own endpoint, which never marks the driver as available — going online
 * is still the driver's decision. The precise 30-second heartbeat in
 * background-location.ts takes over the moment they do, and this one pauses.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

import { ApiError, postDriverStandbyLocation } from '@/lib/api';

export const DRIVER_STANDBY_TASK = 'wheelers-driver-standby';
const TOKEN_KEY = 'wheelers.driver.standby.token';
// Local mirror of the server preference, so app start and going offline can
// decide without a network round-trip.
const ENABLED_KEY = 'wheelers.driver.standby.enabled';

// Same guard as background-location.ts: on a build without the native module
// the package throws at import, so the import must be lazy.
/* eslint-disable @typescript-eslint/no-require-imports */
let TaskManager: typeof import('expo-task-manager') | null = null;
try {
  TaskManager = require('expo-task-manager');
} catch {
  TaskManager = null;
}
/* eslint-enable @typescript-eslint/no-require-imports */

let taskDefined = false;
try {
  TaskManager?.defineTask(DRIVER_STANDBY_TASK, taskHandler);
  taskDefined = TaskManager != null;
} catch {
  taskDefined = false;
}

async function taskHandler({ data, error }: { data: unknown; error: unknown }): Promise<void> {
  if (error || !data) return;
  const locations = (data as { locations?: Location.LocationObject[] }).locations;
  const latest = locations?.[locations.length - 1];
  if (!latest) return;
  try {
    const accessToken = await AsyncStorage.getItem(TOKEN_KEY);
    if (!accessToken) {
      await pauseStandbyUpdates();
      return;
    }
    await postDriverStandbyLocation({
      accessToken,
      lat: latest.coords.latitude,
      lng: latest.coords.longitude,
    });
  } catch (postError) {
    // The server says alerts are off, or this login is no longer valid: stop
    // collecting. Anything else (no signal) just waits for the next fix.
    if (postError instanceof ApiError && (postError.code === 'STANDBY_OFF' || postError.status === 401)) {
      await disableStandby();
    }
  }
}

export async function isStandbySupported(): Promise<boolean> {
  if (!taskDefined || !TaskManager) return false;
  return TaskManager.isAvailableAsync().catch(() => false);
}

export async function isStandbyEnabledLocally(): Promise<boolean> {
  return (await AsyncStorage.getItem(ENABLED_KEY).catch(() => null)) === '1';
}

export async function setStandbyEnabledLocally(enabled: boolean): Promise<void> {
  if (enabled) await AsyncStorage.setItem(ENABLED_KEY, '1');
  else await AsyncStorage.removeItem(ENABLED_KEY);
}

/** Start the off-shift updates if the driver opted in and the OS allows it. */
export async function resumeStandbyIfEnabled(accessToken: string): Promise<void> {
  try {
    if (!(await isStandbyEnabledLocally())) return;
    if (!(await isStandbySupported())) return;
    const { granted } = await Location.getBackgroundPermissionsAsync();
    if (!granted) return;
    await AsyncStorage.setItem(TOKEN_KEY, accessToken);
    const already = await Location.hasStartedLocationUpdatesAsync(DRIVER_STANDBY_TASK).catch(() => false);
    if (already) return;
    await Location.startLocationUpdatesAsync(DRIVER_STANDBY_TASK, {
      accuracy: Location.Accuracy.Low,
      timeInterval: 10 * 60_000,
      distanceInterval: 500,
      deferredUpdatesInterval: 10 * 60_000,
      pausesUpdatesAutomatically: true,
      showsBackgroundLocationIndicator: false,
      foregroundService: {
        notificationTitle: 'Nearby ride alerts are on',
        notificationBody: "You're offline. Wheelers checks your rough location now and then to tell you about riders close by. Turn off in Settings.",
        notificationColor: '#FF7700',
      },
    });
  } catch {
    // Best effort: alerts are a convenience, never a reason to interrupt the driver.
  }
}

/** Stop collecting but keep the preference — used while the driver is online. */
export async function pauseStandbyUpdates(): Promise<void> {
  try {
    if (!taskDefined) return;
    const started = await Location.hasStartedLocationUpdatesAsync(DRIVER_STANDBY_TASK).catch(() => false);
    if (started) await Location.stopLocationUpdatesAsync(DRIVER_STANDBY_TASK);
  } catch {
    // best effort
  }
}

/** Stop collecting and forget the preference on this phone (switch off, logout). */
export async function disableStandby(): Promise<void> {
  await pauseStandbyUpdates();
  await AsyncStorage.multiRemove([TOKEN_KEY, ENABLED_KEY]).catch(() => undefined);
}
