/**
 * Coming back to sign-in after leaving the app: a code that was sent is still
 * waited for while it is good, and not after.
 *
 *   node --test __tests__/rider-sign-in-state.test.mjs
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
const outFile = join(mkdtempSync(join(tmpdir(), 'wheelers-sign-in-state-')), 'bundle.cjs');
execFileSync('npx', ['esbuild', join(projectRoot, 'lib/rider-sign-in-state.ts'), '--bundle', '--platform=node', '--format=cjs',
  `--alias:@react-native-async-storage/async-storage=${join(here, 'stubs/async-storage.cjs')}`, `--outfile=${outFile}`], { cwd: projectRoot, stdio: 'pipe' });
const state = createRequire(import.meta.url)(outFile);
const { freshPendingCode, PENDING_CODE_MS } = state;

const SENT = 1_800_000_000_000;
const code = (over = {}) => ({ phone: '+2348031234567', channel: 'sms', sentAt: SENT, ...over });

test('a code sent a moment ago is still the one to type', () => {
  assert.deepEqual(freshPendingCode(code(), SENT + 30_000), code());
  assert.deepEqual(freshPendingCode(code({ channel: 'whatsapp' }), SENT + 60_000).channel, 'whatsapp');
  assert.equal(freshPendingCode(code({ channel: 'pigeon' }), SENT + 1).channel, 'sms', 'an unknown channel reads as SMS');
});

test('once it is too old to be good on the server, nobody is sent to type it', () => {
  assert.ok(freshPendingCode(code(), SENT + PENDING_CODE_MS - 1));
  assert.equal(freshPendingCode(code(), SENT + PENDING_CODE_MS), null);
  assert.ok(freshPendingCode(code(), SENT + 10 * 60_000), 'ten minutes on, a 30-minute code is still good');
  assert.equal(freshPendingCode(code(), SENT + 31 * 60_000), null);
});

test('anything that is not a real pending code is ignored', () => {
  assert.equal(freshPendingCode(null, SENT), null);
  assert.equal(freshPendingCode('x', SENT), null);
  assert.equal(freshPendingCode(code({ phone: '0803' }), SENT + 1), null);
  assert.equal(freshPendingCode(code({ sentAt: 'now' }), SENT + 1), null);
  assert.equal(freshPendingCode(code({ sentAt: SENT + 5_000 }), SENT), null, 'a time in the future is a wrong clock, not a fresh code');
});

test('kept on the phone and forgotten on request; the name step is remembered until done', async () => {
  const now = Date.now();
  await state.rememberPendingCode({ phone: '+2348031234567', channel: 'sms', sentAt: now });
  assert.equal((await state.readPendingCode(now + 1000)).phone, '+2348031234567');
  assert.equal(await state.readPendingCode(now + PENDING_CODE_MS + 1), null, 'too old: dropped');
  assert.equal(await state.readPendingCode(now + 1000), null, 'and it stays dropped');
  await state.rememberPendingCode({ phone: '+2348031234567', channel: 'sms', sentAt: now });
  await state.forgetPendingCode();
  assert.equal(await state.readPendingCode(now + 1000), null);

  assert.equal(await state.isNameNeeded(), false);
  await state.markNameNeeded();
  assert.equal(await state.isNameNeeded(), true);
  await state.clearNameNeeded();
  assert.equal(await state.isNameNeeded(), false);
});
