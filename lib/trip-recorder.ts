/* eslint-disable @typescript-eslint/no-require-imports */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireOptionalNativeModule } from 'expo';

import {
  completeTripRecordingSegment,
  getTripRecordingSetting,
  getTripRecordingUploadUrl,
  ApiError,
} from '@/lib/api';
import { drainUploads, enqueueSegment, type QueuedSegment } from '@/lib/recording-uploads';

/**
 * Trip voice recording on the driver's phone. It records only when all of
 * these are true: the server says this driver records (the flag and pilot
 * list), the driver's own "Record trips" switch is on (default on), the
 * microphone is allowed, and this build has the recorder in it (an OTA
 * reaches older builds: there, nothing happens and nothing is announced).
 *
 * 5-minute AAC segments, mono, 32 kbps (about 14 MB an hour). Each finished
 * segment goes to the upload queue; the rider is told once the first starts.
 */

const SEGMENT_MS = 5 * 60 * 1000;
const SWITCH_KEY = 'wheelers.driver.recordTrips';
const QUEUE_KEY = 'wheelers.driver.recordingQueue';
const nextIndexKey = (rideId: string) => `wheelers.driver.recordingNext.${rideId}`;

/** The recorder, only when this build carries its native part. */
function audio(): any | null {
  try {
    if (!requireOptionalNativeModule('ExpoAudio')) return null;
    return require('expo-audio');
  } catch {
    return null;
  }
}

function fileSystem(): any | null {
  try {
    return require('expo-file-system/legacy');
  } catch {
    return null;
  }
}

/** Can this build record at all (for Settings: hide the switch when it cannot)? */
export function recorderAvailable(): boolean {
  return audio() !== null;
}

export async function getRecordTripsSwitch(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(SWITCH_KEY)) !== 'off';
  } catch {
    return true;
  }
}

export async function setRecordTripsSwitch(on: boolean): Promise<void> {
  await AsyncStorage.setItem(SWITCH_KEY, on ? 'on' : 'off').catch(() => undefined);
}

export async function microphoneGranted(): Promise<boolean> {
  const mod = audio();
  if (!mod) return false;
  try {
    return Boolean((await mod.getRecordingPermissionsAsync())?.granted);
  } catch {
    return false;
  }
}

/** Asked once with the other permissions, after location and notifications. */
export async function requestMicrophone(): Promise<boolean> {
  const mod = audio();
  if (!mod) return false;
  try {
    return Boolean((await mod.requestRecordingPermissionsAsync())?.granted);
  } catch {
    return false;
  }
}

const MIC_ASKED_KEY = 'wheelers.driver.recordingMicAsked';

/**
 * Asked once, after location and notifications, with a short word first:
 * only when this build can record, the server records this driver, the
 * driver's switch is on and the microphone was never allowed.
 */
export async function askMicrophoneOnce(input: {
  getAccessToken: () => Promise<string | null>;
  explain: () => Promise<boolean>;
}): Promise<void> {
  if (!audio()) return;
  if ((await AsyncStorage.getItem(MIC_ASKED_KEY).catch(() => null)) === 'yes') return;
  if (!(await getRecordTripsSwitch()) || (await microphoneGranted())) return;
  const accessToken = await input.getAccessToken().catch(() => null);
  if (!accessToken) return;
  const setting = await getTripRecordingSetting({ accessToken }).catch(() => ({ recordTrips: false }));
  if (!setting.recordTrips) return;
  await AsyncStorage.setItem(MIC_ASKED_KEY, 'yes').catch(() => undefined);
  if (await input.explain()) await requestMicrophone();
}

function recordingOptions(mod: any) {
  const base = mod.RecordingPresets?.HIGH_QUALITY ?? {};
  return {
    ...base,
    extension: '.m4a',
    sampleRate: 22050,
    numberOfChannels: 1,
    bitRate: 32000,
    android: { ...(base.android ?? {}), extension: '.m4a', outputFormat: 'mpeg4', audioEncoder: 'aac' },
    ios: { ...(base.ios ?? {}), extension: '.m4a' },
  };
}

async function loadQueue(): Promise<QueuedSegment[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveQueue(queue: QueuedSegment[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue)).catch(() => undefined);
}

async function nextIndex(rideId: string): Promise<number> {
  const raw = await AsyncStorage.getItem(nextIndexKey(rideId)).catch(() => null);
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

type Deps = {
  getAccessToken: () => Promise<string | null>;
  /** Over the driver's socket. */
  send: (type: string, payload: Record<string, unknown>) => Promise<void>;
};

let active: { rideId: string; recorder: any; startedAt: number; index: number; timer: ReturnType<typeof setTimeout> | null } | null = null;
let starting = false;
let draining = false;

async function token(deps: Deps): Promise<string> {
  const accessToken = await deps.getAccessToken();
  if (!accessToken) throw new ApiError('Not signed in', 401);
  return accessToken;
}

/** Uploads what is waiting, one run at a time. */
export async function drainRecordingUploads(deps: Pick<Deps, 'getAccessToken'>): Promise<number> {
  const fs = fileSystem();
  if (!fs || draining) return 0;
  draining = true;
  try {
    return await drainUploads({
      load: loadQueue,
      save: saveQueue,
      fileSize: async (uri) => {
        const info = await fs.getInfoAsync(uri).catch(() => null);
        return info?.exists && typeof info.size === 'number' ? info.size : null;
      },
      deleteFile: (uri) => fs.deleteAsync(uri, { idempotent: true }),
      uploadUrl: async (rideId, segmentIndex, bytes) =>
        (await getTripRecordingUploadUrl({ accessToken: await token(deps as Deps), rideId, segmentIndex, bytes })).url,
      put: async (url, uri) => {
        const result = await fs.uploadAsync(url, uri, {
          httpMethod: 'PUT',
          uploadType: fs.FileSystemUploadType?.BINARY_CONTENT ?? 0,
          headers: { 'Content-Type': 'audio/mp4' },
        });
        if (!result || result.status < 200 || result.status >= 300) throw new ApiError('Upload failed', result?.status ?? 0);
      },
      complete: async (rideId, segmentIndex, durationSec) => {
        await completeTripRecordingSegment({ accessToken: await token(deps as Deps), rideId, segmentIndex, durationSec });
      },
      now: () => Date.now(),
    });
  } finally {
    draining = false;
  }
}

async function finishSegment(deps: Deps): Promise<void> {
  const current = active;
  if (!current) return;
  if (current.timer) clearTimeout(current.timer);
  current.timer = null;
  try {
    await current.recorder.stop();
  } catch {
    /* already stopped */
  }
  const uri: string | null = current.recorder.uri ?? null;
  try {
    current.recorder.release?.();
  } catch {
    /* nothing to release */
  }
  if (uri) {
    const queue = enqueueSegment(await loadQueue(), {
      rideId: current.rideId,
      segmentIndex: current.index,
      uri,
      durationSec: Math.max(1, Math.round((Date.now() - current.startedAt) / 1000)),
      createdAt: Date.now(),
    }, Date.now());
    await saveQueue(queue);
    await AsyncStorage.setItem(nextIndexKey(current.rideId), String(current.index + 1)).catch(() => undefined);
  }
  void drainRecordingUploads(deps).catch(() => 0);
}

async function startSegment(mod: any, rideId: string, index: number, deps: Deps): Promise<boolean> {
  const recorder = new mod.AudioModule.AudioRecorder(recordingOptions(mod));
  await recorder.prepareToRecordAsync();
  recorder.record();
  active = { rideId, recorder, startedAt: Date.now(), index, timer: null };
  active.timer = setTimeout(() => {
    void (async () => {
      const ride = active?.rideId;
      const next = (active?.index ?? 0) + 1;
      await finishSegment(deps);
      if (ride && next < 40) await startSegment(mod, ride, next, deps).catch(() => { active = null; });
      else active = null;
    })();
  }, SEGMENT_MS);
  return true;
}

/**
 * The trip started (or the app came back mid-trip): record, if everything
 * allows it. Safe to call again for the same ride.
 */
export async function startTripRecording(rideId: string, deps: Deps): Promise<boolean> {
  if (active?.rideId === rideId || starting) return active?.rideId === rideId;
  const mod = audio();
  if (!mod) return false;
  starting = true;
  try {
    if (!(await getRecordTripsSwitch())) return false;
    if (!(await microphoneGranted())) return false;
    const setting = await getTripRecordingSetting({ accessToken: await token(deps) }).catch(() => ({ recordTrips: false }));
    if (!setting.recordTrips) return false;
    if (active) await stopTripRecording(deps);
    await mod.setAudioModeAsync({ allowsRecording: true, allowsBackgroundRecording: true, shouldPlayInBackground: true, playsInSilentMode: true }).catch(() => undefined);
    await startSegment(mod, rideId, await nextIndex(rideId), deps);
    await deps.send('ride:recording:started', { rideId }).catch(() => undefined);
    return true;
  } catch {
    active = null;
    return false;
  } finally {
    starting = false;
  }
}

/** The trip ended or was cancelled: the last segment goes to the queue. */
export async function stopTripRecording(deps: Deps): Promise<void> {
  if (!active) return;
  await finishSegment(deps);
  active = null;
  const mod = audio();
  await mod?.setAudioModeAsync?.({ allowsRecording: false, allowsBackgroundRecording: false }).catch(() => undefined);
}

export function recordingRideId(): string | null {
  return active?.rideId ?? null;
}
