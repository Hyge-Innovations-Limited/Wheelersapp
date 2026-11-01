/**
 * A rider who reopens the app gets their trip back, with the trip code the
 * driver needs to start it; a search, a finished trip or nothing restores nothing.
 *
 *   node --test __tests__/rider-active-ride.test.mjs
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
const outFile = join(mkdtempSync(join(tmpdir(), 'wheelers-restore-')), 'restore.cjs');
execFileSync('npx', ['esbuild', join(projectRoot, 'lib/rider-active-ride.ts'), '--bundle', '--platform=node', '--format=cjs', `--outfile=${outFile}`], { cwd: projectRoot, stdio: 'pipe' });
const { restoredRideFrom } = createRequire(import.meta.url)(outFile);

const ride = (over = {}) => ({
  id: 'ride-1', tripId: 'WH-00012', status: 'ARRIVED',
  pickup: { lat: 6.5, lng: 3.37, address: 'Yaba' },
  destination: { lat: 6.45, lng: 3.43, address: 'Lekki' },
  stops: [{ type: 'INTERMEDIATE', address: 'Ikeja' }, { type: 'DESTINATION', address: 'Lekki' }],
  fareEstimateNgn: 4000, agreedFareNgn: 3500, startedAt: null,
  driver: { id: 'd1', userId: 'u1', name: 'Tunde', phone: null, rating: 4.8, vehicleMake: 'Toyota', vehicleModel: 'Corolla', vehiclePlate: 'KJA-1' },
  tripCode: '4821',
  ...over,
});

test('a trip waiting for pickup comes back with its code, route and driver', () => {
  const r = restoredRideFrom(ride());
  assert.equal(r.status, 'matched');
  assert.equal(r.tripCode, '4821');
  assert.deepEqual(r.itinerary, { pickup: 'Yaba', stops: ['Ikeja', 'Lekki'] }, 'the destination is the last stop');
  assert.equal(r.fareEstimateNgn, 3500, 'the agreed fare');
  assert.deepEqual([r.driver.driverName, r.driver.vehicleModel, r.driver.vehiclePlate], ['Tunde', 'Toyota Corolla', 'KJA-1']);
});

test('a trip under way comes back as active, without a code to show', () => {
  const r = restoredRideFrom(ride({ status: 'IN_PROGRESS', startedAt: '2026-09-30T10:00:00Z' }));
  assert.equal(r.status, 'active');
  assert.equal(r.tripCode, undefined);
  assert.equal(r.startedAt, '2026-09-30T10:00:00Z');
});

test('nothing to restore: no ride, no driver yet, or a finished one', () => {
  assert.equal(restoredRideFrom(null), null);
  assert.equal(restoredRideFrom(ride({ status: 'MATCHING', driver: null })), null);
  assert.equal(restoredRideFrom(ride({ status: 'COMPLETED' })), null);
});

const NOW = Date.parse('2026-10-12T10:00:00Z');
const search = (over = {}) => ride({
  status: 'MATCHING', driver: null, tripCode: null, agreedFareNgn: null, riderOfferNgn: 6000,
  search: {
    bidsCloseAt: '2026-10-12T10:20:00Z',
    offers: [
      { driverId: 'd2', driverUserId: 'u2', counterOfferNgn: 6300, driverName: 'Aisha', driverRating: 4.8, vehiclePlate: 'KJA-2', vehicleModel: 'Honda Accord', etaSeconds: 360, distanceKm: 2.1, receivedAt: '2026-10-12T09:58:00Z' },
      { driverId: 'd1', driverUserId: 'u1', counterOfferNgn: 6000, driverName: 'Tunde', driverRating: null, vehiclePlate: 'KJA-1', vehicleModel: 'Toyota Corolla', etaSeconds: 240, distanceKm: null, receivedAt: '2026-10-12T09:57:00Z' },
    ],
  },
  ...over,
});

test('a search still open comes back as a search, with the rider\'s price, when it closes and the offers cheapest first', () => {
  const r = restoredRideFrom(search(), NOW);
  assert.equal(r.status, 'bidding');
  assert.equal(r.restored, true);
  assert.equal(r.riderOfferNgn, 6000);
  assert.equal(r.bidsCloseAt, '2026-10-12T10:20:00Z');
  assert.deepEqual(r.itinerary, { pickup: 'Yaba', stops: ['Ikeja', 'Lekki'] });
  assert.deepEqual(r.offers.map((o) => [o.driverName, o.counterOfferNgn]), [['Tunde', 6000], ['Aisha', 6300]]);
  assert.equal(r.offers[0].driverRating, 5, 'a driver with no rating yet shows the starting one');
  assert.equal('distanceKm' in r.offers[0], false);
  assert.equal(r.driver, undefined);
});

test('a search that has already closed, or that an older server sends without its offers, is not brought back', () => {
  assert.equal(restoredRideFrom(search(), Date.parse('2026-10-12T10:20:00Z')), null, 'closed on the dot');
  assert.equal(restoredRideFrom(search({ search: null }), NOW), null);
  assert.equal(restoredRideFrom(search({ search: undefined }), NOW), null);
  assert.equal(restoredRideFrom(search({ status: 'CANCELLED' }), NOW), null);
});

test('a trip with a driver is marked as brought back too', () => {
  assert.equal(restoredRideFrom(ride()).restored, true);
});
