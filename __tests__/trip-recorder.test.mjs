/**
 * The trip recorder records only while the trip is on: a trip that ends
 * while recording is still starting never records, the 5-minute rollover
 * never outlives the trip, and the driver's switch stops it at once.
 *
 *   node --test __tests__/trip-recorder.test.mjs
 */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const projectRoot = join(here, '..');
const req = createRequire(import.meta.url);

function freshRecorder() {
  const outFile = join(mkdtempSync(join(tmpdir(), 'wheelers-recorder-')), 'out.cjs');
  execFileSync('npx', [
    'esbuild', join(projectRoot, 'lib/trip-recorder.ts'),
    '--bundle', '--platform=node', '--format=cjs',
    `--alias:expo=${join(here, 'stubs/expo-optional-modules.cjs')}`,
    `--alias:@react-native-async-storage/async-storage=${join(here, 'stubs/async-storage.cjs')}`,
    `--alias:@/lib/api=${join(here, 'stubs/trip-recording-api.cjs')}`,
    `--alias:expo-audio=${join(here, 'stubs/expo-audio-fake.cjs')}`,
    `--alias:expo-file-system/legacy=${join(here, 'stubs/file-system-legacy-fake.cjs')}`,
    `--outfile=${outFile}`,
  ], { cwd: projectRoot, stdio: 'pipe' });
  globalThis.__WHEELERS_TEST_EXPO_MODULES__ = { ExpoAudio: {} };
  globalThis.__WHEELERS_TEST_AUDIO__ = { recorders: [], modes: [], prepare: null };
  globalThis.__WHEELERS_TEST_ASYNC_STORAGE__?.clear();
  globalThis.__WHEELERS_TEST_RECORDING_SETTING__ = null;
  globalThis.__WHEELERS_TEST_RECORDING_START__ = null;
  globalThis.__WHEELERS_TEST_RECORDING_STARTS__ = [];
  return req(outFile);
}

const deps = { getAccessToken: async () => 'token' };
const announced = () => globalThis.__WHEELERS_TEST_RECORDING_STARTS__;
const recorders = () => globalThis.__WHEELERS_TEST_AUDIO__.recorders;
const live = () => recorders().filter((r) => r.recording);
const flush = () => new Promise((resolve) => setImmediate(resolve));
async function queued() {
  const raw = globalThis.__WHEELERS_TEST_ASYNC_STORAGE__.get('wheelers.driver.recordingQueue');
  return (raw ? JSON.parse(raw) : []).map((item) => `${item.rideId}:${item.segmentIndex}`);
}

test('a trip records from start to end, the rider is told once, and the piece is queued', async () => {
  const recorder = freshRecorder();
  assert.equal(await recorder.startTripRecording('ride-1', deps), true);
  assert.equal(live().length, 1);
  assert.equal(await recorder.startTripRecording('ride-1', deps), true);
  assert.equal(recorders().length, 1);
  assert.deepEqual(announced(), ['ride-1'], 'the rider is told before anything records');
  await recorder.stopTripRecording(deps);
  assert.equal(live().length, 0);
  assert.equal(recorder.recordingRideId(), null);
  assert.deepEqual(await queued(), ['ride-1:0']);
});

test('the trip ends while recording is still starting: it never records and nothing is announced', async () => {
  const recorder = freshRecorder();
  let answer;
  globalThis.__WHEELERS_TEST_RECORDING_SETTING__ = () => new Promise((resolve) => { answer = resolve; });
  const starting = recorder.startTripRecording('ride-1', deps);
  await flush();
  await recorder.stopTripRecording(deps);
  answer({ recordTrips: true });
  assert.equal(await starting, false);
  assert.equal(live().length, 0);
  assert.equal(recorders().filter((r) => r.recording).length, 0);
});

test('the trip ends while the recorder is getting ready: it is released, never started', async () => {
  const recorder = freshRecorder();
  let ready;
  globalThis.__WHEELERS_TEST_AUDIO__.prepare = () => new Promise((resolve) => { ready = resolve; });
  const starting = recorder.startTripRecording('ride-1', deps);
  while (!ready) await flush();
  await recorder.stopTripRecording(deps);
  ready();
  assert.equal(await starting, false);
  assert.equal(live().length, 0);
  assert.equal(recorders().filter((r) => r.recording).length, 0);
});

test('every 5 minutes a new piece starts; after the trip ends no new piece starts', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const recorder = freshRecorder();
    await recorder.startTripRecording('ride-1', deps);
    mock.timers.tick(5 * 60 * 1000);
    for (let i = 0; i < 20 && recorders().length < 2; i++) await flush();
    assert.equal(recorders().length, 2);
    assert.equal(live().length, 1);
    assert.equal(live()[0], recorders()[1]);
    await recorder.stopTripRecording(deps);
    mock.timers.tick(10 * 60 * 1000);
    for (let i = 0; i < 20; i++) await flush();
    assert.equal(recorders().length, 2);
    assert.equal(live().length, 0);
    assert.deepEqual((await queued()).sort(), ['ride-1:0', 'ride-1:1']);
  } finally {
    mock.timers.reset();
  }
});

test('the trip ends right as a piece rolls over: no piece starts after the trip', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const recorder = freshRecorder();
    await recorder.startTripRecording('ride-1', deps);
    mock.timers.tick(5 * 60 * 1000);
    const stopping = recorder.stopTripRecording(deps);
    for (let i = 0; i < 20; i++) await flush();
    await stopping;
    assert.equal(live().length, 0);
    assert.equal(recorder.recordingRideId(), null);
  } finally {
    mock.timers.reset();
  }
});

test('the driver turns Record trips off mid-trip: it stops now, and the next trip does not record', async () => {
  const recorder = freshRecorder();
  await recorder.startTripRecording('ride-1', deps);
  await recorder.setRecordTripsSwitch(false);
  assert.equal(live().length, 0);
  assert.equal(recorder.recordingRideId(), null);
  assert.equal(await recorder.startTripRecording('ride-2', deps), false);
  assert.equal(live().length, 0);
});

test('the server does not record this driver: nothing records and nothing is announced', async () => {
  const recorder = freshRecorder();
  globalThis.__WHEELERS_TEST_RECORDING_SETTING__ = async () => ({ recordTrips: false });
  assert.equal(await recorder.startTripRecording('ride-1', deps), false);
  assert.equal(recorders().length, 0);
  assert.equal(recorders().filter((r) => r.recording).length, 0);
});

test('no yes from the server (no signal, or the trip is not running there): nothing records', async () => {
  const recorder = freshRecorder();
  globalThis.__WHEELERS_TEST_RECORDING_START__ = async () => { throw Object.assign(new Error('Network request failed'), { status: 0 }); };
  assert.equal(await recorder.startTripRecording('ride-1', deps), false);
  assert.equal(recorders().length, 0);
  globalThis.__WHEELERS_TEST_RECORDING_START__ = null;
  assert.equal(await recorder.startTripRecording('ride-1', deps), true, 'the next try, with signal, records');
  await recorder.stopTripRecording(deps);
});

test('after a reinstall mid-trip the pieces carry on from the server\'s number, never over a recorded one', async () => {
  const recorder = freshRecorder();
  globalThis.__WHEELERS_TEST_RECORDING_START__ = async () => ({ ok: true, nextSegmentIndex: 4 });
  await recorder.startTripRecording('ride-1', deps);
  await recorder.stopTripRecording(deps);
  assert.deepEqual(await queued(), ['ride-1:4']);
});

test('a new trip starts while the last one is still starting: the new trip records', async () => {
  const recorder = freshRecorder();
  let answer;
  globalThis.__WHEELERS_TEST_RECORDING_SETTING__ = () => new Promise((resolve) => { answer = resolve; });
  const first = recorder.startTripRecording('ride-1', deps);
  await flush();
  globalThis.__WHEELERS_TEST_RECORDING_SETTING__ = null;
  assert.equal(await recorder.startTripRecording('ride-2', deps), false, 'busy: it is picked up when the first start ends');
  answer({ recordTrips: true });
  assert.equal(await first, false);
  for (let i = 0; i < 20 && recorder.recordingRideId() !== 'ride-2'; i++) await flush();
  assert.equal(recorder.recordingRideId(), 'ride-2');
  assert.equal(live().length, 1);
  await recorder.stopTripRecording(deps);
});
