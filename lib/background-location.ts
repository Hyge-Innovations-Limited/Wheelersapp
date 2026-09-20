/**
 * The driver's heartbeat while the phone is in their pocket.
 *
 * The WebSocket and the foreground GPS loop die the moment the app
 * backgrounds — which used to leave the DB saying ONLINE at stale
 * coordinates forever (ghost drivers), until Wave 1 made matching require a
 * heartbeat within 90s. This task IS that heartbeat: a background location
 * session (foreground service on Android, background location on iOS) that
 * POSTs the position over HTTP, keeping "Online" on screen true in the
 * market with the screen off.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

import { postDriverLocation } from '@/lib/api';

export const DRIVER_LOCATION_TASK = 'wheelers-driver-location';
const TOKEN_KEY = 'wheelers.driver.liveness.token';
// A running task keeps the options it was started with. Bump this whenever the
// options below change, and the next start replaces the old task instead of
// leaving it running with stale settings.
const OPTIONS_VERSION = '2';
const OPTIONS_VERSION_KEY = 'wheelers.driver.liveness.optionsVersion';

// Builds compiled before expo-task-manager was added lack the native module,
// and the package throws AT IMPORT — so the import itself must be lazy. On
// such builds the heartbeat degrades to foreground-only instead of crashing
// the app at launch. Ships fully in the next native build.
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
  TaskManager?.defineTask(DRIVER_LOCATION_TASK, taskHandler);
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
    if (!accessToken) return;
    await postDriverLocation({
      accessToken,
      lat: latest.coords.latitude,
      lng: latest.coords.longitude,
    });
  } catch {
    // Missing one heartbeat is fine; the next one is 30s away.
  }
}

export async function startDriverLivenessUpdates(accessToken: string): Promise<void> {
  try {
    if (!taskDefined || !TaskManager) return;
    if (!(await TaskManager.isAvailableAsync().catch(() => false))) return;
    await AsyncStorage.setItem(TOKEN_KEY, accessToken);
    const { granted } = await Location.getBackgroundPermissionsAsync();
    if (!granted) return; // foreground-only session; WS pings still cover it
    const already = await Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK).catch(() => false);
    if (already) {
      if ((await AsyncStorage.getItem(OPTIONS_VERSION_KEY)) === OPTIONS_VERSION) return;
      await Location.stopLocationUpdatesAsync(DRIVER_LOCATION_TASK).catch(() => undefined);
    }
    await AsyncStorage.setItem(OPTIONS_VERSION_KEY, OPTIONS_VERSION);
    await Location.startLocationUpdatesAsync(DRIVER_LOCATION_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 30_000,
      // MUST stay 0. Android treats this as "no update until the phone has
      // moved this far", so at 50 a driver PARKED waiting for a ride sent no
      // heartbeat at all — and 90 s after the socket dropped the server,
      // correctly, took them offline. A heartbeat has to beat standing still.
      distanceInterval: 0,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: "You're online on Wheelers",
        notificationBody: 'Receiving ride requests — location keeps you visible to riders.',
        notificationColor: '#FF7700',
      },
    });
  } catch {
    // Liveness degrades to foreground-only; never block going online.
  }
}

export async function stopDriverLivenessUpdates(): Promise<void> {
  try {
    if (!taskDefined) return;
    await AsyncStorage.removeItem(TOKEN_KEY);
    const started = await Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK).catch(() => false);
    if (started) await Location.stopLocationUpdatesAsync(DRIVER_LOCATION_TASK);
  } catch {
    // best effort
  }
}
