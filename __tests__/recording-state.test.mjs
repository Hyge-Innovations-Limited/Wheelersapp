/**
 * The trip screen says "Recording started" while the trip records: it follows
 * the recording flag, which tells its listeners only when it really changes.
 *
 *   node --test __tests__/recording-state.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const projectRoot = join(here, '..');
const outFile = join(mkdtempSync(join(tmpdir(), 'wheelers-recording-state-')), 'bundle.cjs');
execFileSync('npx', ['esbuild', join(projectRoot, 'lib/recording-state.ts'), '--bundle', '--platform=node', '--format=cjs', `--outfile=${outFile}`], { cwd: projectRoot, stdio: 'pipe' });
const { isRecordingTrip, setRecordingTrip, onRecordingTripChange } = createRequire(import.meta.url)(outFile);

test('listeners hear on and off, once each, and stop hearing when they leave', () => {
  const heard = [];
  const off = onRecordingTripChange(() => heard.push(isRecordingTrip()));
  setRecordingTrip(true);
  setRecordingTrip(true);
  setRecordingTrip(false);
  off();
  setRecordingTrip(true);
  setRecordingTrip(false);
  assert.deepEqual(heard, [true, false]);
});

test('the driver trip screen shows the line only while recording', () => {
  const screen = readFileSync(join(projectRoot, 'app/driver/active-trip.tsx'), 'utf8');
  assert.match(screen, /const recordingTrip = useRecordingTrip\(\);/);
  assert.match(screen, /\{recordingTrip \? \(/);
  assert.match(screen, />Recording started</);
});
