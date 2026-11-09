/**
 * After a driver sends an offer (Accept, own price, every group seat answered, or a changed bid),
 * the request screen goes to the Active tab, where the bid waits.
 *
 *   node --test __tests__/driver-active-bids.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const outFile = join(mkdtempSync(join(tmpdir(), 'wheelers-active-bids-')), 'bundle.cjs');
execFileSync('npx', ['esbuild', join(projectRoot, 'lib/driver-active-bids.ts'), '--bundle', '--platform=node', '--format=cjs', `--outfile=${outFile}`], { cwd: projectRoot, stdio: 'pipe' });
const { leaveToActiveBids, ACTIVE_BIDS_HREF } = createRequire(import.meta.url)(outFile);

test('pops back to the tabs on Active in one step', () => {
  const calls = [];
  leaveToActiveBids({ dismissTo: (h) => calls.push(['dismissTo', h]), replace: (h) => calls.push(['replace', h]) });
  assert.deepEqual(calls, [['dismissTo', '/driver/(tabs)/active']]);
  assert.equal(ACTIVE_BIDS_HREF, '/driver/(tabs)/active');
});

test('a router that throws falls back to replace, and never throws itself', () => {
  const calls = [];
  leaveToActiveBids({ dismissTo: () => { throw new Error('not ready'); }, replace: (h) => calls.push(h) });
  assert.deepEqual(calls, ['/driver/(tabs)/active']);
  assert.doesNotThrow(() => leaveToActiveBids({ dismissTo: () => { throw new Error('x'); }, replace: () => { throw new Error('y'); } }));
});

test('every way a driver sends an offer leaves to Active', () => {
  const request = readFileSync(join(projectRoot, 'app/driver/incoming-request.tsx'), 'utf8');
  // Accept at the rider's price, and the driver's own price: right after the send succeeds.
  const sends = request.split('await acceptRide(').slice(1).map((after) => after.slice(0, 200));
  assert.equal(sends.length, 2);
  for (const after of sends) assert.match(after, /setBidSent\(true\);\s*leaveToActiveBids\(router\);/);
  // A group request: once every seat has an answer.
  assert.match(request, /seats\.every\(\(seat\) => seatBids\[seat\.rideId\] !== undefined\)\)\s*\{\s*leftRef\.current = true;\s*leaveToActiveBids\(router\);/);
  // A changed bid on the bid screen.
  const pending = readFileSync(join(projectRoot, 'app/driver/pending-bid.tsx'), 'utf8');
  assert.match(pending, /await acceptRide\(bid\.offer\.rideId[^;]*;\s*setEditOpen\(false\);\s*setEditAmount\(''\);\s*leaveToActiveBids\(router\);/);
});
