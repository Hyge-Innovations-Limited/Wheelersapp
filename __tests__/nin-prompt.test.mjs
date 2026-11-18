/**
 * The NIN popup on Home (18 Nov 2026): opens only when Home is idle, once per app open; the box takes 11 digits.
 *
 *   node --test __tests__/nin-prompt.test.mjs
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
const outFile = join(mkdtempSync(join(tmpdir(), 'wheelers-nin-')), 'out.cjs');
execFileSync('npx', ['esbuild', join(projectRoot, 'lib/nin-prompt.ts'), '--bundle', '--platform=node', '--format=cjs', `--outfile=${outFile}`], { cwd: projectRoot, stdio: 'pipe' });
const N = createRequire(import.meta.url)(outFile);

test('opens only when Home is in front, with no search or trip and no other sheet; once per app open', () => {
  const idle = { focused: true, rideActive: false, otherSheet: false };
  assert.equal(N.ninSheetMayOpen({ ...idle, focused: false }), false);
  assert.equal(N.ninSheetMayOpen({ ...idle, rideActive: true }), false, 'never during a search or a trip');
  assert.equal(N.ninSheetMayOpen({ ...idle, otherSheet: true }), false);
  assert.equal(N.ninSheetMayOpen(idle), true);
  N.markNinAsked();
  assert.equal(N.ninSheetMayOpen(idle), false, 'once per open');
});

test('the box: 11 digits (spaces and dashes taken out), anything else is not a NIN', () => {
  assert.equal(N.cleanNinInput('123 4567-8901'), '12345678901');
  assert.equal(N.cleanNinInput('1234'), null);
  assert.equal(N.cleanNinInput('1234567890a'), null);
});

test('a sheet that never came up (another one in front) is put away uncounted, and Home may ask again', () => {
  N.markNinAsked();
  assert.equal(N.ninSheetMayOpen({ focused: true, rideActive: false, otherSheet: false }), false);
  N.releaseNinAsk();
  assert.equal(N.ninSheetMayOpen({ focused: true, rideActive: false, otherSheet: false }), true);
  assert.ok(N.NIN_SHOW_TIMEOUT_MS >= 1000);
});
