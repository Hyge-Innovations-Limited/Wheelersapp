/**
 * Driver ride news by push: no banner while the app is on screen (the socket
 * already showed it); in the background every one shows. New requests ring as before.
 *
 *   node --test __tests__/driver-push-quiet.test.mjs
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
const outFile = join(mkdtempSync(join(tmpdir(), 'wheelers-driver-push-quiet-')), 'bundle.cjs');
execFileSync('npx', ['esbuild', join(projectRoot, 'lib/driver-push-quiet.ts'), '--bundle', '--platform=node', '--format=cjs', `--outfile=${outFile}`], { cwd: projectRoot, stdio: 'pipe' });
const { quietDriverNews, DRIVER_NEWS_PUSH_TYPES } = createRequire(import.meta.url)(outFile);

test('every piece of driver ride news is quiet on screen and shown in the background', () => {
  for (const type of ['ride:rider_paid', 'ride:rider_paying', 'ride:matched', 'ride:cancelled', 'bid_declined', 'ride:bid_lost', 'ride:bid_timeout', 'ride:route:updated', 'ride:completed', 'wallet:updated', 'ride:offer_accepted', 'ride:rider_paying_ended', 'ride:offer_updated']) {
    assert.ok(DRIVER_NEWS_PUSH_TYPES.includes(type), type);
    assert.equal(quietDriverNews(type, true, 'active'), true, `${type} on screen`);
    assert.equal(quietDriverNews(type, true, 'background'), false, `${type} in the background`);
    assert.equal(quietDriverNews(type, true, 'inactive'), false, `${type} locked`);
  }
});

test('a new request still rings on screen; the rider app and chat are untouched', () => {
  assert.equal(quietDriverNews('ride:request', true, 'active'), false);
  assert.equal(quietDriverNews('chat:message', true, 'active'), false);
  assert.equal(quietDriverNews('ride:matched', false, 'active'), false, 'a rider is told a driver was found as before');
  assert.equal(quietDriverNews(undefined, true, 'active'), false);
});
