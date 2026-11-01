/**
 * Whether a trip is being recorded right now. Kept apart from the recorder so
 * the sounds can ask without loading it: a chime that resets the phone's audio
 * to playback only would cut the recording on an iPhone.
 */
let recording = false;

export function isRecordingTrip(): boolean {
  return recording;
}

export function setRecordingTrip(on: boolean): void {
  recording = on;
}
