/**
 * The booked driver pulled out and the search goes on (the ride is back to
 * 'bidding'): every trip screen sends the rider to Finding drivers for the
 * same trip at the same price. Anything else stays where it is.
 *
 *   node --test __tests__/search-again-route.test.mjs
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
const dir = mkdtempSync(join(tmpdir(), 'wheelers-search-again-'));
const entry = join(dir, 'entry.ts');
writeFileSync(entry, `
export * from '${join(projectRoot, 'lib/search-again-route.ts')}';
export * from '${join(projectRoot, 'lib/ride-cancelled.ts')}';
export { parseRideItineraryParam } from '${join(projectRoot, 'lib/ride-route.ts')}';
`);
const outFile = join(dir, 'bundle.cjs');
execFileSync('npx', ['esbuild', entry, '--bundle', '--platform=node', '--format=cjs', `--outfile=${outFile}`], { cwd: projectRoot, stdio: 'pipe' });
const { searchAgainRoute, rideAfterCancelled, parseRideItineraryParam } = createRequire(import.meta.url)(outFile);

const itinerary = { pickup: 'Yaba', stops: ['Ikeja'] };
const matched = { rideId: 'ride-1', status: 'matched', itinerary, riderOfferNgn: 3000, driver: { driverId: 'd1' } };

test('driver pulled out, search goes on: Finding drivers, same trip, same price', () => {
  const ride = rideAfterCancelled(matched, { rideId: 'ride-1', cancelledBy: 'driver', searchingAgain: true });
  const route = searchAgainRoute(ride);
  assert.equal(route.pathname, '/matching');
  assert.equal(route.params.offer, '3000');
  assert.deepEqual(parseRideItineraryParam(route.params.itinerary), parseRideItineraryParam(encodeURIComponent(JSON.stringify(itinerary))));
});

test('no price known: the trip alone', () => {
  const route = searchAgainRoute({ status: 'bidding', itinerary });
  assert.equal(route.params.offer, undefined);
});

test('a plain cancel, a booked or running trip, or no ride: nowhere', () => {
  assert.equal(searchAgainRoute(rideAfterCancelled(matched, { rideId: 'ride-1', reason: 'rider_cancelled' })), null);
  for (const status of ['matched', 'matching', 'active', 'completed', 'cancelled']) {
    assert.equal(searchAgainRoute({ ...matched, status }), null, status);
  }
  assert.equal(searchAgainRoute(null), null);
});
