/**
 * The wallet check before "Auto-book a driver at ₦X?" never hangs the search,
 * and the rider's yes or no follows the search: from the server's answers to
 * ride:auto_accept, and from its active-ride reply after a restart.
 *
 *   node --test __tests__/auto-book-answer.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const projectRoot = join(here, '..');
const dir = mkdtempSync(join(tmpdir(), 'wheelers-auto-book-'));
const entry = join(dir, 'entry.ts');
writeFileSync(entry, `
export * from '${join(projectRoot, 'lib/with-timeout.ts')}';
export * from '${join(projectRoot, 'lib/auto-accept.ts')}';
export * from '${join(projectRoot, 'lib/rider-active-ride.ts')}';
`);
const outFile = join(dir, 'bundle.cjs');
execFileSync('npx', ['esbuild', entry, '--bundle', '--platform=node', '--format=cjs', `--outfile=${outFile}`], { cwd: projectRoot, stdio: 'pipe' });
const { withTimeout, applyAutoAcceptReply, restoredRideFrom, serverAnswerFrom, reconcileSearch } = createRequire(import.meta.url)(outFile);

test('no balance within the time: the fallback (search without auto-booking), never a hang', async () => {
  const never = new Promise(() => {});
  assert.equal(await withTimeout(never, 20, null), null);
  assert.equal(await withTimeout(Promise.resolve(5000), 20, null), 5000);
  assert.equal(await withTimeout(Promise.reject(new Error('down')), 20, null), null);
});

test('the server\'s answers set the rider\'s yes or no', () => {
  const ride = { rideId: 'ride-1', status: 'bidding', autoAcceptChosen: true };
  assert.equal(applyAutoAcceptReply(ride, 'ride:auto_accept:done', { rideId: 'ride-1', on: false, reason: 'insufficient_funds' }).ride.autoAcceptChosen, false);
  assert.equal(applyAutoAcceptReply(ride, 'ride:auto_accept:rejected', { rideId: 'ride-1', reason: 'not_searching' }).ride.autoAcceptChosen, false);
  assert.equal(applyAutoAcceptReply({ ...ride, autoAcceptChosen: false }, 'ride:auto_accept:done', { rideId: 'ride-1', on: true }).ride.autoAcceptChosen, true);
});

const NOW = Date.parse('2026-10-27T10:00:00Z');
const server = (over = {}) => ({
  id: 'ride-1', tripId: null, status: 'MATCHING',
  pickup: { lat: 6.5, lng: 3.37, address: 'Yaba' }, destination: { lat: 6.45, lng: 3.43, address: 'Lekki' },
  stops: [{ type: 'DESTINATION', address: 'Lekki' }], fareEstimateNgn: 4000, agreedFareNgn: null, startedAt: null,
  driver: null, tripCode: null, riderOfferNgn: 3000,
  search: { bidsCloseAt: new Date(NOW + 200_000).toISOString(), offers: [] },
  ...over,
});

test('after a restart the yes comes back when the server says so; otherwise it stays unknown', () => {
  assert.equal(restoredRideFrom(server({ autoAccept: true }), NOW).autoAcceptChosen, true);
  assert.equal(restoredRideFrom(server({ autoAccept: false }), NOW).autoAcceptChosen, false);
  assert.equal(restoredRideFrom(server(), NOW).autoAcceptChosen, undefined);
  const open = { rideId: 'ride-1', status: 'bidding', riderOfferNgn: 3000, offers: [], autoAcceptChosen: true };
  assert.equal(reconcileSearch(open, serverAnswerFrom(server(), NOW), NOW).autoAcceptChosen, true, 'an older reply keeps what the screen knew');
  assert.equal(reconcileSearch(open, serverAnswerFrom(server({ autoAccept: false }), NOW), NOW).autoAcceptChosen, false);
});
