/**
 * ride:cancelled for the rider: the end of the ride, unless the booked driver
 * pulled out and the server searches again on the same ride (searchingAgain):
 * then it goes back to finding drivers, with no driver, offers or old clock.
 *
 *   node --test __tests__/ride-cancelled.test.mjs
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
const outFile = join(mkdtempSync(join(tmpdir(), 'wheelers-ride-cancelled-')), 'bundle.cjs');
execFileSync('npx', ['esbuild', join(projectRoot, 'lib/ride-cancelled.ts'), '--bundle', '--platform=node', '--format=cjs', `--outfile=${outFile}`], { cwd: projectRoot, stdio: 'pipe' });
const { rideAfterCancelled, isSearchingAgain } = createRequire(import.meta.url)(outFile);

const matched = {
  rideId: 'ride-1', status: 'matched', riderOfferNgn: 3000, itinerary: { pickup: 'Yaba', stops: ['Ikeja'] },
  driver: { driverId: 'd1', driverName: 'Ada', lockedFareNgn: 3200 }, driverLocation: { lat: 6.5, lng: 3.3 },
  tripCode: '1234', offers: [{ driverId: 'd2' }], bidsCloseAt: '2026-10-27T09:00:00Z',
};

test('a driver pulled out and the search goes on: back to bidding on the same ride', () => {
  const next = rideAfterCancelled(matched, { rideId: 'ride-1', cancelledBy: 'driver', refundedNgn: 3200, searchingAgain: true });
  assert.equal(next.status, 'bidding');
  assert.equal(next.rideId, 'ride-1');
  assert.deepEqual(next.offers, []);
  assert.equal(next.driver, undefined, 'no held fare of the driver who left');
  assert.equal(next.driverLocation, undefined);
  assert.equal(next.tripCode, undefined);
  assert.equal(next.bidTimeout, false);
  assert.equal(next.bidsCloseAt, undefined, 'the old clock is gone');
  assert.equal(next.riderOfferNgn, 3000, 'the price stays');
  assert.deepEqual(next.itinerary, matched.itinerary);
});

test('the server\'s new close time is kept when it sends one', () => {
  const next = rideAfterCancelled(matched, { rideId: 'ride-1', searchingAgain: true, bidsCloseAt: '2026-10-27T10:05:00Z' });
  assert.equal(next.bidsCloseAt, '2026-10-27T10:05:00Z');
});

test('a plain cancel still ends the ride', () => {
  const next = rideAfterCancelled(matched, { rideId: 'ride-1', reason: 'rider_cancelled', cancelledBy: 'rider' });
  assert.equal(next.status, 'cancelled');
  assert.equal(next.cancelReason, 'rider_cancelled');
  assert.equal(isSearchingAgain({ searchingAgain: 'yes' }), false);
  assert.equal(rideAfterCancelled(matched, { rideId: 'ride-1', searchingAgain: 'yes' }).status, 'cancelled');
});

test('searchingAgain for another ride, or a trip already under way: it ends as before', () => {
  assert.equal(rideAfterCancelled(matched, { rideId: 'ride-2', searchingAgain: true }).status, 'cancelled');
  assert.equal(rideAfterCancelled({ ...matched, status: 'active' }, { rideId: 'ride-1', searchingAgain: true }).status, 'cancelled');
  assert.equal(rideAfterCancelled(null, { rideId: 'ride-1', searchingAgain: true }), null);
});
