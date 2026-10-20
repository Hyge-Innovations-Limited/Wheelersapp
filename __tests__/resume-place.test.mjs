/**
 * Opening again where they were: a screen that can stand on its own is
 * remembered with its params and reopened once, on the same side, within
 * half an hour; home, a trip under way and signing in or out are not; the
 * splash itself neither remembers nor forgets.
 *
 *   node --test __tests__/resume-place.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(here, '..');
const stub = join(here, 'stubs/async-storage.cjs');
const outFile = join(mkdtempSync(join(tmpdir(), 'wheelers-resume-')), 'bundle.cjs');
execFileSync('npx', ['esbuild', join(projectRoot, 'lib/resume-place.ts'), '--bundle', '--platform=node', '--format=cjs',
  `--alias:@react-native-async-storage/async-storage=${stub}`, `--external:${stub}`, `--outfile=${outFile}`], { cwd: projectRoot, stdio: 'pipe' });
const require = createRequire(import.meta.url);
const { rememberPlace, takePlace, RESUME_WITHIN_MS } = require(outFile);

const T = 1_000_000;

test('setting a price, closed by Android, opened ten minutes later: back on that screen with the trip, once', async () => {
  await rememberPlace('/ride-selection', { itinerary: '{"pickup":"Yaba"}', estimate: '{"fare":8300}' }, 'rider', T);
  assert.deepEqual(await takePlace('rider', T + 10 * 60_000), { pathname: '/ride-selection', params: { itinerary: '{"pickup":"Yaba"}', estimate: '{"fare":8300}' } });
  assert.equal(await takePlace('rider', T + 11 * 60_000), null, 'once');
});

test('too long ago, the other side, or a screen that cannot stand alone: home as usual', async () => {
  await rememberPlace('/rider/wallet', {}, 'rider', T);
  assert.equal(await takePlace('rider', T + RESUME_WITHIN_MS + 1), null);
  await rememberPlace('/rider/wallet', {}, 'rider', T);
  assert.equal(await takePlace('driver', T + 1000), null);
  for (const screen of ['/matching', '/driver-found', '/rider/active-trip', '/rider-cancel', '/rider/trip-rating', '/rider-auth', '/welcome', '/rider']) {
    await rememberPlace(screen, {}, 'rider', T);
    assert.equal(await takePlace('rider', T + 1000), null, screen);
  }
});

test('going home, or onto a trip, forgets the last place; the splash at start does not', async () => {
  await rememberPlace('/destination-search', { q: 'Ikeja' }, 'rider', T);
  await rememberPlace('/rider', {}, 'rider', T + 1);
  assert.equal(await takePlace('rider', T + 2), null, 'home forgets');
  await rememberPlace('/support/chat', {}, 'driver', T);
  await rememberPlace('/splash', {}, 'driver', T + 1);
  await rememberPlace('/', {}, 'driver', T + 2);
  assert.equal((await takePlace('driver', T + 3))?.pathname, '/support/chat', 'starting up leaves it alone');
  await rememberPlace('/driver/earnings', {}, 'driver', T);
  await rememberPlace('/driver/navigation', {}, 'driver', T + 1);
  assert.equal(await takePlace('driver', T + 2), null, "a trip under way is the session's to bring back");
});
