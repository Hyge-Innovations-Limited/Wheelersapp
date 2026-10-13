/**
 * Rolling logins: a login over a day old is renewed, a fresh one is left
 * alone, an expired or refused one ends, and a bad connection never signs
 * anyone out.
 *
 *   node --test __tests__/session-renewal.test.mjs
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
const outFile = join(mkdtempSync(join(tmpdir(), 'wheelers-renew-')), 'bundle.cjs');
execFileSync('npx', ['esbuild', join(projectRoot, 'lib/session-renewal.ts'), '--bundle', '--platform=node', '--format=cjs', `--outfile=${outFile}`], { cwd: projectRoot, stdio: 'pipe' });
const { renewSessionIfDue, loginTimes, RENEW_AFTER_MS } = createRequire(import.meta.url)(outFile);

const DAY = 86400;
const NOW = Date.UTC(2026, 9, 8, 12);
function token(issuedSecondsAgo, ttl = 30 * DAY) {
  const b64 = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const iat = Math.floor(NOW / 1000) - issuedSecondsAgo;
  return `${b64({ alg: 'HS256' })}.${b64({ sub: 'u1', iat, exp: iat + ttl })}.sig`;
}
function deps(stored, refresh) {
  const saved = [];
  return { saved, d: { getToken: async () => stored, refresh, store: async (t) => { saved.push(t); }, now: () => NOW } };
}

test('not signed in: nothing happens', async () => {
  const { d } = deps(null, async () => assert.fail('no call'));
  assert.equal(await renewSessionIfDue(d), 'none');
});

test('signed in today: left alone, no call', async () => {
  const { d } = deps(token(3600), async () => assert.fail('no call'));
  assert.equal(await renewSessionIfDue(d), 'fresh');
});

test('over a day old: swapped for a fresh 30-day login and stored', async () => {
  const fresh = token(0);
  const { d, saved } = deps(token(20 * DAY), async () => ({ accessToken: fresh }));
  assert.equal(await renewSessionIfDue(d), 'renewed');
  assert.deepEqual(saved, [fresh]);
  assert.equal(loginTimes(fresh).endsAt - loginTimes(fresh).issuedAt, 30 * DAY * 1000);
});

test('expired: ended without asking the server', async () => {
  const { d } = deps(token(31 * DAY), async () => assert.fail('no call'));
  assert.equal(await renewSessionIfDue(d), 'ended');
});

test('the server refuses (signed out elsewhere, deleted): ended', async () => {
  const { d } = deps(token(5 * DAY), async () => { throw Object.assign(new Error('no'), { status: 401 }); });
  assert.equal(await renewSessionIfDue(d), 'ended');
});

test('no signal or a server hiccup never signs anyone out', async () => {
  for (const error of [new Error('Network request failed'), Object.assign(new Error('boom'), { status: 500 })]) {
    const { d, saved } = deps(token(5 * DAY), async () => { throw error; });
    assert.equal(await renewSessionIfDue(d), 'offline');
    assert.deepEqual(saved, []);
  }
});

test('opening the app twice at once renews once', async () => {
  let calls = 0;
  const { d } = deps(token(2 * DAY), async () => { calls += 1; await new Promise((r) => setTimeout(r, 20)); return { accessToken: token(0) }; });
  const results = await Promise.all([renewSessionIfDue(d), renewSessionIfDue(d)]);
  assert.deepEqual(results, ['renewed', 'renewed']);
  assert.equal(calls, 1);
  assert.equal(RENEW_AFTER_MS, DAY * 1000);
});

test('signed in today but signed out from the dashboard: the server says so and the login ends', async () => {
  const { d } = deps(token(3600), async () => assert.fail('too new to renew'));
  assert.equal(await renewSessionIfDue({ ...d, stillValid: async () => { throw Object.assign(new Error('signed out'), { status: 401 }); } }), 'ended');
});

test('signed in today and still good, or the question cannot be asked: nothing changes', async () => {
  const { d } = deps(token(3600), async () => assert.fail('too new to renew'));
  assert.equal(await renewSessionIfDue({ ...d, stillValid: async () => ({ ok: true }) }), 'fresh');
  assert.equal(await renewSessionIfDue({ ...d, stillValid: async () => { throw new Error('Network request failed'); } }), 'fresh', 'a bad connection never signs anyone out');
  assert.equal(await renewSessionIfDue({ ...d, stillValid: async () => { throw Object.assign(new Error('no such route'), { status: 404 }); } }), 'fresh', 'an older server has no such question');
});
