// Stand-in for expo-audio on a build that has it: every recorder is kept on
// globalThis so a test can see what recorded and when.
const state = (globalThis.__WHEELERS_TEST_AUDIO__ ??= { recorders: [], modes: [], prepare: null });
let n = 0;
class AudioRecorder {
  constructor() {
    this.id = n++;
    this.recording = false;
    this.stopped = false;
    this.uri = null;
    state.recorders.push(this);
  }
  async prepareToRecordAsync() {
    if (state.prepare) await state.prepare();
  }
  record() {
    this.recording = true;
  }
  async stop() {
    this.recording = false;
    this.stopped = true;
    this.uri = `file:///piece-${this.id}.m4a`;
  }
  release() {}
}
exports.AudioModule = { AudioRecorder };
exports.RecordingPresets = { HIGH_QUALITY: {} };
exports.getRecordingPermissionsAsync = async () => ({ granted: true });
exports.requestRecordingPermissionsAsync = async () => ({ granted: true });
exports.setAudioModeAsync = async (mode) => {
  state.modes.push(mode);
};
