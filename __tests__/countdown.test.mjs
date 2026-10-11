/**
 * The waits on the phone verification screen: "Send again in 0:42", "try
 * again in 28 minutes", and which numbers the Send button accepts.
 *
 *   node --test __tests__/countdown.test.mjs
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
const outFile = join(mkdtempSync(join(tmpdir(), 'wheelers-countdown-')), 'bundle.cjs');
execFileSync('npx', ['esbuild', join(projectRoot, 'lib/countdown.ts'), '--bundle', '--platform=node', '--format=cjs', `--outfile=${outFile}`], { cwd: projectRoot, stdio: 'pipe' });
const { clock, waitWords, secondsUntil, localNumber, looksLikeNigerianMobile } = createRequire(import.meta.url)(outFile);

test('a wait as a clock and in words', () => {
  assert.equal(clock(1800), '30:00');
  assert.equal(clock(1694), '28:14');
  assert.equal(clock(42), '0:42');
  assert.equal(clock(0), '0:00');
  assert.equal(clock(-5), '0:00');
  assert.equal(waitWords(1800), '30 minutes');
  assert.equal(waitWords(1694), '29 minutes', 'rounded up: never promise sooner than it is');
  assert.equal(waitWords(60), '1 minute');
  assert.equal(waitWords(42), '42 seconds');
  assert.equal(waitWords(1), '1 second');
});

test('seconds left until a moment, never below zero', () => {
  assert.equal(secondsUntil(null, 1000), 0);
  assert.equal(secondsUntil(61_000, 1000), 60);
  assert.equal(secondsUntil(1500, 1000), 1, 'half a second left still shows 1');
  assert.equal(secondsUntil(500, 1000), 0);
});

test('a number is shown the way it is typed, and the Send button knows a Nigerian mobile', () => {
  assert.equal(localNumber('+2348031234567'), '08031234567');
  assert.equal(localNumber(null), '');
  assert.equal(localNumber('+14155550100'), '+14155550100');
  for (const ok of ['08031234567', '0803 123 4567', '+2348031234567', '2348031234567', '8031234567', '09012345678', '07012345678']) assert.equal(looksLikeNigerianMobile(ok), true, ok);
  for (const no of ['', '0803', '080312345678', '01234567890', '+14155550100', '06012345678']) assert.equal(looksLikeNigerianMobile(no), false, no);
});
