/**
 * What a driver is told when a papers request fails: the app's standard
 * wording, never a status word or a developer's message.
 *
 *   node --test __tests__/papers-error.test.mjs
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
const outFile = join(mkdtempSync(join(tmpdir(), 'wheelers-papers-error-')), 'bundle.cjs');
execFileSync('npx', ['esbuild', join(projectRoot, 'lib/papers-error.ts'), '--bundle', '--platform=node', '--format=cjs', '--define:__DEV__=false', `--alias:@=${projectRoot}`, `--outfile=${outFile}`], { cwd: projectRoot, stdio: 'pipe' });
const { papersError, MAX_PAPER_BYTES } = createRequire(import.meta.url)(outFile);

const api = (message, status, code) => Object.assign(new Error(message), { status, code });
const FALLBACK = 'Your paper was not sent. Please try again.';

test('the server\'s own sentence reaches the driver untouched', () => {
  assert.equal(papersError(api('That insurance has expired. Renew it, then send the new one.', 400, 'EXPIRED'), FALLBACK), 'That insurance has expired. Renew it, then send the new one.');
  assert.equal(papersError(api('That file is too big. Send one under 10 MB.', 413, 'FILE_TOO_BIG'), FALLBACK), 'That file is too big. Send one under 10 MB.');
  assert.equal(papersError(api('Enter your full name as it is on your licence: first name and surname.', 400, 'BAD_NAME'), FALLBACK), 'Enter your full name as it is on your licence: first name and surname.');
});

test('no signal, a signed-out phone and a struggling server each say what to do', () => {
  assert.match(papersError(new Error('Network request failed'), FALLBACK), /offline/i);
  assert.equal(papersError(api('Unauthorized', 401), FALLBACK), 'Please sign in again to continue.');
  assert.match(papersError(api('Internal Server Error', 500), FALLBACK), /try again shortly/);
  assert.match(papersError(api('KYC submission failed: PrismaClientKnownRequestError', 500), FALLBACK), /try again shortly/, 'never a database error');
  assert.match(papersError(api('', 413), FALLBACK), /too large/);
});

test('a server with no papers yet does not read as a lost paper', () => {
  assert.equal(papersError(api('Not found', 404), FALLBACK), 'Your papers are not available yet. Please try again later.');
});

test('anything written for a developer is replaced by the fallback', () => {
  assert.equal(papersError(new Error('Cannot read properties of undefined (reading \'uri\')'), FALLBACK), FALLBACK);
  assert.equal(papersError(new Error('Body must be a JSON object'), FALLBACK), FALLBACK);
  assert.equal(papersError(undefined, FALLBACK), FALLBACK);
  assert.equal(papersError(new Error('Please sign in again to send this.'), FALLBACK), 'Please sign in again to send this.', 'our own sentences pass');
});

test('files over 10 MB are turned away on the phone', () => {
  assert.equal(MAX_PAPER_BYTES, 10 * 1024 * 1024);
});
