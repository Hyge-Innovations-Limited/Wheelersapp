/**
 * The selfie's face check: the prompts move on only when the driver really
 * does each one (look straight, close then open the eyes, turn one way then
 * the other), a stray frame does not count, and the shutter is only allowed
 * at the end, looking straight with eyes open. Frames are made up here: the
 * phone's face detection is not run.
 *
 *   node --test __tests__/face-check.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const projectRoot = join(here, '..');
const outFile = join(mkdtempSync(join(tmpdir(), 'wheelers-face-')), 'bundle.cjs');
execFileSync('npx', ['esbuild', join(projectRoot, 'lib/face-check.ts'), '--bundle', '--platform=node', '--format=cjs', `--alias:expo=${join(here, 'stubs/expo.cjs')}`, `--outfile=${outFile}`], { cwd: projectRoot, stdio: 'pipe' });
const { readFrame, START, stepsDone } = createRequire(import.meta.url)(outFile);

const face = (over = {}) => ({ x: 0.3, y: 0.25, w: 0.4, h: 0.5, yaw: 0, roll: 0, eyes: 0.95, ...over });
const frame = (faces, eyesKind = 'probability') => ({ width: 720, height: 960, eyesKind, faces });

function run(frames, state = START) {
  let out = { state, hint: null, canShoot: false };
  for (const f of frames) out = readFrame(out.state, f);
  return out;
}

test('a sky, a ceiling, two people, or a face too far away never moves the prompts on', () => {
  assert.equal(readFrame(START, frame([])).hint, "We can't see your face");
  assert.equal(readFrame(START, frame([face(), face({ x: 0.6 })])).hint, 'Only your face, please');
  assert.equal(readFrame(START, frame([face({ w: 0.1, h: 0.12 })])).hint, 'Move a little closer');
  assert.equal(readFrame(START, frame([face({ x: 0.0, y: 0.0 })])).hint, 'Put your face in the oval');
  assert.equal(readFrame(START, frame([face({ yaw: 30 })])).hint, 'Look straight at the camera');
  assert.equal(run([frame([]), frame([]), frame([]), frame([])]).state.prompt, 'straight');
});

test('the whole check, Android numbers: straight, eyes shut then open, one side then the other, then the shutter', () => {
  const straight = frame([face()]);
  let out = run([straight]);
  assert.equal(out.state.prompt, 'straight', 'one frame is not enough');
  out = run([straight, straight]);
  assert.equal(out.state.prompt, 'close_eyes');
  assert.equal(out.state.openEyes, 0.95);
  assert.equal(stepsDone(out.state.prompt), 1);

  out = run([frame([face({ eyes: 0.9 })])], out.state);
  assert.equal(out.state.prompt, 'close_eyes', 'eyes still open');
  out = run([frame([face({ eyes: 0.05 })]), frame([face({ eyes: 0.04 })])], out.state);
  assert.equal(out.state.prompt, 'open_eyes');
  out = run([frame([face({ eyes: 0.9 })]), frame([face({ eyes: 0.92 })])], out.state);
  assert.equal(out.state.prompt, 'turn_one');

  out = run([frame([face({ yaw: -25, x: 0.1 })]), frame([face({ yaw: -28, x: 0.08 })])], out.state);
  assert.equal(out.state.prompt, 'turn_other', 'a turned face may leave the oval');
  out = run([frame([face({ yaw: -30 })]), frame([face({ yaw: -30 })])], out.state);
  assert.equal(out.state.prompt, 'turn_other', 'the same side again does not count');
  out = run([frame([face({ yaw: 24 })]), frame([face({ yaw: 26 })])], out.state);
  assert.equal(out.state.prompt, 'ready');
  assert.equal(stepsDone(out.state.prompt), 4);

  assert.equal(readFrame(out.state, frame([face({ yaw: 25 })])).canShoot, false, 'still turned');
  assert.equal(readFrame(out.state, frame([face({ eyes: 0.1 })])).canShoot, false, 'eyes shut');
  assert.equal(readFrame(out.state, frame([])).canShoot, false, 'face gone');
  assert.equal(readFrame(out.state, frame([face()])).canShoot, true);
});

test('iPhone numbers: shut eyes are judged against this driver\'s own open eyes', () => {
  let out = run([frame([face({ eyes: 0.3 })], 'ratio'), frame([face({ eyes: 0.32 })], 'ratio')]);
  assert.equal(out.state.prompt, 'close_eyes');
  out = run([frame([face({ eyes: 0.25 })], 'ratio'), frame([face({ eyes: 0.24 })], 'ratio')], out.state);
  assert.equal(out.state.prompt, 'close_eyes', 'narrowed, not shut');
  out = run([frame([face({ eyes: 0.1 })], 'ratio'), frame([face({ eyes: 0.09 })], 'ratio')], out.state);
  assert.equal(out.state.prompt, 'open_eyes');
});

test('a face whose eyes cannot be read skips the eye prompts instead of getting stuck', () => {
  const out = run([frame([face({ eyes: null })]), frame([face({ eyes: null })])]);
  assert.equal(out.state.prompt, 'turn_one');
});
