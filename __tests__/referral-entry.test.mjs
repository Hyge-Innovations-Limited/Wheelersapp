/**
 * A referral code typed while signing up: optional, tidied, and a refusal is
 * a sentence under the box, never a dead end.
 *
 *   node --test __tests__/referral-entry.test.mjs
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
const stub = join(here, 'stubs/referral-api.cjs');
const outFile = join(mkdtempSync(join(tmpdir(), 'wheelers-referral-')), 'bundle.cjs');
execFileSync('npx', ['esbuild', join(projectRoot, 'lib/referral-entry.ts'), '--bundle', '--platform=node', '--format=cjs',
  `--alias:@/lib/api=${stub}`, `--external:${stub}`, `--outfile=${outFile}`], { cwd: projectRoot, stdio: 'pipe' });
const require = createRequire(import.meta.url);
const { addReferralAtSignUp, referralRefusal, tidyReferralCode } = require(outFile);
const api = require(stub);

test('what is typed becomes capitals and digits, twelve at most', () => {
  assert.equal(tidyReferralCode(' timi-24 '), 'TIMI24');
  assert.equal(tidyReferralCode('abcdefghijklmnop'), 'ABCDEFGHIJKL');
});

test('an empty box asks the server nothing; a good code is sent tidied', async () => {
  assert.equal(await addReferralAtSignUp('token', ''), null);
  assert.equal(api.calls.length, 0);
  assert.equal(await addReferralAtSignUp('token', 'tunde'), null);
  assert.deepEqual(api.calls[0], { accessToken: 'token', code: 'TUNDE' });
  assert.match(await addReferralAtSignUp('token', 'ab'), /4 to 12/);
  assert.equal(api.calls.length, 1, 'a code too short to exist is not sent');
});

test('a refusal is a sentence they can act on, and one already added does not stop them', async () => {
  api.refuseWith('Referral code not found.');
  assert.match(await addReferralAtSignUp('token', 'NOPE1'), /was not found.*leave this empty/);
  api.refuseWith('You cannot use your own referral code.');
  assert.match(await addReferralAtSignUp('token', 'MINE1'), /your own code/);
  api.refuseWith('A referral code has already been applied to this account.');
  assert.equal(await addReferralAtSignUp('token', 'TUNDE'), null);
  api.refuseWith('socket hang up');
  assert.match(await addReferralAtSignUp('token', 'TUNDE'), /could not be added just now/);
});

test('on Invite friends a refused code is named, with what to do about it', () => {
  assert.equal(referralRefusal('Referral code was not found.', 'DEJI'),
    'No one has the code DEJI. Check it with the person who gave it to you. They may need to create it in their app first.');
  assert.equal(referralRefusal('You cannot use your own referral code.', 'DEJI'), 'DEJI is your own code. Enter the code a friend gave you.');
  assert.equal(referralRefusal('A referral code has already been applied.', 'DEJI'), null, 'already on the account: nothing to fix');
  assert.equal(referralRefusal('socket hang up', 'DEJI'), null, 'not about the code: the screen says what went wrong');
});
