import { useSyncExternalStore } from 'react';

/**
 * Whether a trip is being recorded right now. Kept apart from the recorder so
 * the sounds can ask without loading it: a chime that resets the phone's audio
 * to playback only would cut the recording on an iPhone. Screens follow it
 * with useRecordingTrip (the trip screen says so while it is on).
 */
let recording = false;
const listeners = new Set<() => void>();

export function isRecordingTrip(): boolean {
  return recording;
}

export function setRecordingTrip(on: boolean): void {
  if (recording === on) return;
  recording = on;
  for (const listener of listeners) listener();
}

export function onRecordingTripChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useRecordingTrip(): boolean {
  return useSyncExternalStore(onRecordingTripChange, isRecordingTrip, isRecordingTrip);
}
