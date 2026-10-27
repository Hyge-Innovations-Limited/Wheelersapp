/**
 * A search on screen squared with the server after the socket was away: the
 * trip if a driver was booked meanwhile (with that driver alone), the open
 * offers if it is still a search, "nobody took it" once over; and ride:matched
 * for another driver or another ride.
 *
 *   node --test __tests__/ride-reconcile.test.mjs
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
const dir = mkdtempSync(join(tmpdir(), 'wheelers-reconcile-'));
const entry = join(dir, 'entry.ts');
writeFileSync(entry, `
export * from '${join(projectRoot, 'lib/rider-active-ride.ts')}';
export * from '${join(projectRoot, 'lib/ride-matched.ts')}';
`);
const outFile = join(dir, 'bundle.cjs');
execFileSync('npx', ['esbuild', entry, '--bundle', '--platform=node', '--format=cjs', `--outfile=${outFile}`], { cwd: projectRoot, stdio: 'pipe' });
const { serverAnswerFrom, reconcileSearch, carryDriver, rideAfterMatched, isForRide } = createRequire(import.meta.url)(outFile);

const NOW = Date.parse('2026-10-27T10:00:00Z');
const server = (over = {}) => ({
  id: 'ride-1', tripId: null, status: 'MATCHING',
  pickup: { lat: 6.5, lng: 3.37, address: 'Yaba' }, destination: { lat: 6.45, lng: 3.43, address: 'Lekki' },
  stops: [{ type: 'DESTINATION', address: 'Lekki' }],
  fareEstimateNgn: 4000, agreedFareNgn: null, startedAt: null, driver: null, tripCode: null, riderOfferNgn: 3000,
  ...over,
});
const offer = (driverId, counterOfferNgn) => ({
  driverId, driverUserId: `u-${driverId}`, counterOfferNgn, driverName: driverId, driverRating: 4.7,
  vehiclePlate: 'P', vehicleModel: 'M', etaSeconds: 300, distanceKm: 1.2, receivedAt: '2026-10-27T09:59:00Z',
});
const searching = {
  rideId: 'ride-1', status: 'bidding', riderOfferNgn: 3000, bidsCloseAt: new Date(NOW + 120_000).toISOString(),
  itinerary: { pickup: 'Yaba', stops: ['Lekki'] }, offers: [{ ...offer('a', 3000), riderCounterNgn: 2800 }],
};

test('booked by auto-accept while the socket was away: the trip, with that driver and the agreed fare', () => {
  const answer = serverAnswerFrom(server({
    status: 'DRIVER_ASSIGNED', agreedFareNgn: 3200, tripCode: '1234',
    driver: { id: 'b', userId: 'u-b', name: 'Bola', phone: '+2348030000000', rating: 4.9, vehicleMake: 'Toyota', vehicleModel: 'Camry', vehiclePlate: 'KJA-9' },
  }), NOW);
  const next = reconcileSearch(searching, answer, NOW);
  assert.equal(next.status, 'matched');
  assert.equal(next.tripCode, '1234');
  assert.deepEqual(next.offers, []);
  assert.equal(next.driver.driverId, 'b');
  assert.equal(next.driver.lockedFareNgn, 3200);
  assert.equal(next.driver.driverPhone, '+2348030000000');
});

test('still a search: the server\'s offers and close time; a pending counter stays while the price holds', () => {
  const close = new Date(NOW + 200_000).toISOString();
  const answer = serverAnswerFrom(server({ search: { bidsCloseAt: close, offers: [offer('a', 3000), offer('c', 2900)] } }), NOW);
  const next = reconcileSearch(searching, answer, NOW);
  assert.equal(next.status, 'bidding');
  assert.equal(next.bidsCloseAt, close);
  assert.deepEqual(next.offers.map((o) => o.driverId), ['c', 'a']);
  assert.equal(next.offers[1].riderCounterNgn, 2800);
});

test('no ride on the server: over once the search time is past, untouched before (it may not be written yet)', () => {
  const none = serverAnswerFrom(null, NOW);
  assert.equal(reconcileSearch(searching, none, NOW), searching);
  const late = reconcileSearch(searching, none, NOW + 121_000);
  assert.equal(late.bidTimeout, true);
  assert.deepEqual(late.offers, []);
  assert.equal(reconcileSearch({ ...searching, status: 'requesting' }, none, NOW + 999_000).bidTimeout, undefined);
});

test('an older server (no search details) or another ride: nothing changes', () => {
  const unknown = serverAnswerFrom(server(), NOW);
  assert.equal(unknown.kind, 'unknown');
  assert.equal(reconcileSearch(searching, unknown, NOW), searching);
  const other = serverAnswerFrom(server({ id: 'ride-9', search: { bidsCloseAt: new Date(NOW + 60_000).toISOString(), offers: [] } }), NOW);
  assert.equal(reconcileSearch(searching, other, NOW), searching);
});

test('the driver carries over only when it is the same driver', () => {
  const shown = { driverId: 'a', driverPhone: '+234801', lockedFareNgn: 3000, etaSeconds: 200, driverName: 'Ade' };
  assert.deepEqual(carryDriver(shown, { driverId: 'b', driverName: 'Bola' }), { driverId: 'b', driverName: 'Bola' });
  assert.deepEqual(carryDriver(shown, { driverId: 'a', driverName: undefined, vehiclePlate: 'X' }), { ...shown, vehiclePlate: 'X' });
});

test('ride:matched with another driver: nothing of the one being confirmed', () => {
  const confirming = { rideId: 'ride-1', status: 'matching', offers: [], driver: { driverId: 'a', driverPhone: '+234801', lockedFareNgn: 3000, etaSeconds: 200, driverName: 'Ade' } };
  const other = rideAfterMatched(confirming, { rideId: 'ride-1', driverId: 'b', driverName: 'Bola', agreedFareNgn: 3350 });
  assert.equal(other.status, 'matched');
  assert.equal(other.driver.driverName, 'Bola');
  assert.equal(other.driver.driverPhone, undefined);
  assert.equal(other.driver.etaSeconds, undefined);
  assert.equal(other.driver.lockedFareNgn, 3350, 'the server\'s agreed fare');
  const same = rideAfterMatched(confirming, { rideId: 'ride-1', driverId: 'a', lockedFareNgn: 3000 });
  assert.equal(same.driver.driverPhone, '+234801');
  assert.equal(same.driver.lockedFareNgn, 3000);
});

test('ride:matched for another ride changes nothing', () => {
  const confirming = { rideId: 'ride-1', status: 'matching', offers: [] };
  assert.equal(rideAfterMatched(confirming, { rideId: 'ride-2', driverId: 'b' }), confirming);
  assert.equal(isForRide(confirming, { rideId: 'ride-2' }), false);
  assert.equal(isForRide(confirming, {}), true, 'older payloads without rideId still count');
});
