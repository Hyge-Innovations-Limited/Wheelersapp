/**
 * "Record trips" off asks first; Keep it on (or closing the box) keeps it on.
 *
 *   node --test __tests__/recording-off-warning.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const outFile = join(mkdtempSync(join(tmpdir(), 'wheelers-recording-off-')), 'bundle.cjs');
execFileSync('npx', ['esbuild', join(projectRoot, 'lib/recording-off-warning.ts'), '--bundle', '--platform=node', '--format=cjs', `--outfile=${outFile}`], { cwd: projectRoot, stdio: 'pipe' });
const { confirmRecordingOff, RECORDING_OFF_TITLE, RECORDING_OFF_BODY } = createRequire(import.meta.url)(outFile);

const tapping = (label) => (title, body, buttons, options) => {
  if (label === null) return options.onDismiss();
  buttons.find((b) => b.text === label).onPress();
};

test('the warning says why recording is there, with Keep it on first', () => {
  let seen;
  void confirmRecordingOff((title, body, buttons) => { seen = { title, body, buttons: buttons.map((b) => b.text) }; });
  assert.equal(seen.title, 'Turn off recording?');
  assert.match(seen.body, /dispute/);
  assert.deepEqual(seen.buttons, ['Keep it on', 'Turn off']);
  assert.equal(RECORDING_OFF_TITLE, seen.title);
  assert.equal(RECORDING_OFF_BODY, seen.body);
});

test('only Turn off turns it off', async () => {
  assert.equal(await confirmRecordingOff(tapping('Turn off')), true);
  assert.equal(await confirmRecordingOff(tapping('Keep it on')), false);
  assert.equal(await confirmRecordingOff(tapping(null)), false, 'closing the box keeps it on');
});
