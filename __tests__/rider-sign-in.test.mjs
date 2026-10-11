/**
 * Rider sign-in by phone: which numbers are accepted, how they are shown
 * back, and what a rider is told when a code cannot be sent or is wrong.
 *
 *   node --test __tests__/rider-sign-in.test.mjs
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
const outFile = join(mkdtempSync(join(tmpdir(), 'wheelers-rider-sign-in-')), 'bundle.cjs');
execFileSync('npx', ['esbuild', join(projectRoot, 'lib/rider-sign-in.ts'), '--bundle', '--platform=node', '--format=cjs', '--define:__DEV__=false', `--outfile=${outFile}`], { cwd: projectRoot, stdio: 'pipe' });
const { riderPhoneFrom, spacedPhone, groupNationalDigits, signInErrorMessage, resendLabel, firstNameOf, looksLikeEmail } = createRequire(import.meta.url)(outFile);

test('a Nigerian mobile number typed any usual way becomes +234…', () => {
  assert.equal(riderPhoneFrom('803 123 4567'), '+2348031234567');
  assert.equal(riderPhoneFrom('08031234567'), '+2348031234567');
  assert.equal(riderPhoneFrom('+234 803 123 4567'), '+2348031234567');
  assert.equal(riderPhoneFrom('2349015208215'), '+2349015208215');
});

test('anything else is not accepted', () => {
  assert.equal(riderPhoneFrom(''), null);
  assert.equal(riderPhoneFrom('803 123 456'), null, 'one digit short');
  assert.equal(riderPhoneFrom('603 123 4567'), null, 'not a mobile prefix');
  assert.equal(riderPhoneFrom('+1 415 555 0100'), null, 'not Nigerian');
});

test('the number is grouped as it is typed and when shown back', () => {
  assert.equal(groupNationalDigits('8031234567'), '803 123 4567');
  assert.equal(groupNationalDigits('08031'), '803 1');
  assert.equal(groupNationalDigits('80312345678999'), '803 123 4567', 'never longer than a number');
  assert.equal(spacedPhone('+2348031234567'), '+234 803 123 4567');
  assert.equal(spacedPhone('+14155550100'), '+14155550100');
});

test('the server\'s reason becomes a sentence the rider can act on', () => {
  const failure = (code) => Object.assign(new Error('server words'), { code });
  assert.match(signInErrorMessage(failure('OTP_INVALID')), /not correct/);
  assert.match(signInErrorMessage(failure('OTP_NOT_FOUND')), /expired/);
  assert.match(signInErrorMessage(failure('OTP_LOCKED')), /new code/);
  assert.match(signInErrorMessage(failure('OTP_RATE_LIMITED')), /10 minutes/);
  assert.match(signInErrorMessage(failure('OTP_DELIVERY_FAILED')), /could not send/);
  assert.equal(signInErrorMessage(failure('SOMETHING_NEW')), 'server words', 'an unknown reason keeps the server\'s sentence');
});

test('resend wording, first names and emails', () => {
  assert.equal(resendLabel(42), 'Send again in 42 seconds');
  assert.equal(resendLabel(0), 'Send a new code');
  assert.equal(firstNameOf('  Timi Olowu '), 'Timi');
  assert.equal(firstNameOf(null), '');
  assert.equal(looksLikeEmail('timi@example.com'), true);
  assert.equal(looksLikeEmail('timi@example'), false);
  assert.equal(looksLikeEmail('timi example.com'), false);
});
