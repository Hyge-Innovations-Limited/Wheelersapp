/**
 * The driver's photo reaches the avatar from offers, matched and a restored
 * trip; no photo or a broken one is initials.
 *
 *   node --test __tests__/driver-photo.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = join(here, '..');
const req = createRequire(import.meta.url);
function load(file) {
  const out = join(mkdtempSync(join(tmpdir(), 'wheelers-photo-')), 'out.cjs');
  execFileSync('npx', ['esbuild', join(root, file), '--bundle', '--platform=node', '--format=cjs', `--alias:@=${root}`, `--outfile=${out}`], { cwd: root, stdio: 'pipe' });
  return req(out);
}
const photo = load('lib/driver-photo.ts');
const matched = load('lib/ride-matched.ts');
const active = load('lib/rider-active-ride.ts');
const offersLib = load('lib/ride-offers.ts');

const URL1 = 'https://r2.example/p.jpg?sig=1';
const URL2 = 'https://r2.example/p2.jpg?sig=2';

test('photoFrom keeps an https url with its key; null, junk and http are no photo', () => {
  assert.deepEqual(photo.photoFrom({ driverPhotoUrl: URL1, driverPhotoKey: 'k1' }), { driverPhotoUrl: URL1, driverPhotoKey: 'k1' });
  assert.deepEqual(photo.photoFrom({ driverPhotoUrl: URL1 }), { driverPhotoUrl: URL1 });
  for (const bad of [{}, null, undefined, { driverPhotoUrl: null, driverPhotoKey: 'k' }, { driverPhotoUrl: 'http://x/p.jpg' }, { driverPhotoUrl: 42 }, { driverPhotoUrl: '' }]) {
    assert.deepEqual(photo.photoFrom(bad), {});
  }
});

test('avatarLook: photo, none, and a failed url falls back to initials', () => {
  assert.equal(photo.avatarLook(URL1, null), 'photo');
  assert.equal(photo.avatarLook(undefined, null), 'initials');
  assert.equal(photo.avatarLook(null, null), 'initials');
  assert.equal(photo.avatarLook(URL1, URL1), 'initials');
  assert.equal(photo.avatarLook(URL2, URL1), 'photo', 'a fresh url is tried again');
});

const prev = (driver) => ({ rideId: 'r1', status: 'matching', offers: [], driver });

test('matched keeps the offer photo when the event has none, and takes a new one', () => {
  const before = prev({ driverId: 'd1', driverPhotoUrl: URL1, driverPhotoKey: 'k1' });
  let r = matched.rideAfterMatched(before, { rideId: 'r1', driverId: 'd1', driverName: 'Tunde' });
  assert.deepEqual([r.driver.driverPhotoUrl, r.driver.driverPhotoKey], [URL1, 'k1']);
  r = matched.rideAfterMatched(before, { rideId: 'r1', driverId: 'd1', driverPhotoUrl: URL2, driverPhotoKey: 'k2' });
  assert.deepEqual([r.driver.driverPhotoUrl, r.driver.driverPhotoKey], [URL2, 'k2']);
});

test('matched: another driver does not inherit the first one\'s photo; no fields means no photo', () => {
  const before = prev({ driverId: 'd1', driverPhotoUrl: URL1, driverPhotoKey: 'k1' });
  const r = matched.rideAfterMatched(before, { rideId: 'r1', driverId: 'd2' });
  assert.equal(r.driver.driverPhotoUrl, undefined);
  const plain = matched.rideAfterMatched(prev(undefined), { rideId: 'r1', driverId: 'd3', driverName: 'A' });
  assert.equal('driverPhotoUrl' in plain.driver, false);
});

const ride = (over = {}) => ({
  id: 'r1', tripId: 'WH-1', status: 'ARRIVED',
  pickup: { lat: 1, lng: 1, address: 'A' }, destination: { lat: 2, lng: 2, address: 'B' }, stops: [],
  fareEstimateNgn: 1000, agreedFareNgn: 1000, startedAt: null, tripCode: '1',
  driver: { id: 'd1', userId: 'u1', name: 'Tunde', phone: null, rating: 4, vehicleMake: 'T', vehicleModel: 'C', vehiclePlate: 'P' },
  ...over,
});

test('a re-bid without a photo keeps the card\'s photo; a new photo replaces it; another driver gets none (SF2)', () => {
  const o = (id, extra = {}) => ({ driverId: id, counterOfferNgn: 900, etaSeconds: 60, ...extra });
  const held = [o('d1', { driverPhotoUrl: URL1, driverPhotoKey: 'k1' })];
  assert.equal(offersLib.mergeOffer(held, o('d1', { counterOfferNgn: 800 }))[0].driverPhotoUrl, URL1);
  assert.equal(offersLib.mergeOffer(held, o('d1', { driverPhotoUrl: URL2, driverPhotoKey: 'k2' }))[0].driverPhotoKey, 'k2');
  assert.equal(offersLib.mergeOffer(held, o('d2')).find((x) => x.driverId === 'd2').driverPhotoUrl, undefined);
});

test('carryPhoto with a different driver (SF4 guard) gives no photo', () => {
  assert.deepEqual(photo.carryPhoto({}, undefined), {});
});

test('a restored trip carries the driver photo; none without', () => {
  let r = active.restoredRideFrom(ride({ driver: { ...ride().driver, driverPhotoUrl: URL1, driverPhotoKey: 'k1' } }));
  assert.deepEqual([r.driver.driverPhotoUrl, r.driver.driverPhotoKey], [URL1, 'k1']);
  r = active.restoredRideFrom(ride());
  assert.equal('driverPhotoUrl' in r.driver, false);
});

test('a restored search keeps each offer\'s photo, and the carried driver keeps it through reconcile', () => {
  const now = Date.now();
  const search = {
    bidsCloseAt: new Date(now + 60000).toISOString(),
    offers: [
      { driverId: 'd1', driverUserId: 'u1', counterOfferNgn: 900, driverName: 'T', driverRating: 4, vehiclePlate: 'P', vehicleModel: 'C', etaSeconds: 60, distanceKm: 1, receivedAt: 'x', driverPhotoUrl: URL1, driverPhotoKey: 'k1' },
      { driverId: 'd2', driverUserId: 'u2', counterOfferNgn: 950, driverName: 'U', driverRating: null, vehiclePlate: 'Q', vehicleModel: 'C', etaSeconds: 90, distanceKm: null, receivedAt: 'y', driverPhotoUrl: null, driverPhotoKey: null },
    ],
  };
  const r = active.restoredRideFrom(ride({ status: 'MATCHING', driver: null, search, riderOfferNgn: 1000 }), now);
  assert.equal(r.offers[0].driverPhotoUrl, URL1);
  assert.equal('driverPhotoUrl' in r.offers[1], false);
  const carried = active.carryDriver({ driverId: 'd1', driverPhotoUrl: URL1, driverPhotoKey: 'k1' }, { driverId: 'd1', driverName: 'T' });
  assert.equal(carried.driverPhotoUrl, URL1);
});

test('rides done are parsed and carried: offer -> merge -> matched -> restore', () => {
  assert.equal(photo.profileFrom({ driverRidesCompleted: 120 }).driverRidesCompleted, 120);
  assert.equal(photo.profileFrom({ driverRidesCompleted: 0 }).driverRidesCompleted, 0);
  for (const bad of [null, '5', 1.5, -1]) assert.equal('driverRidesCompleted' in photo.profileFrom({ driverRidesCompleted: bad }), false);
  const o = (extra = {}) => ({ driverId: 'd1', counterOfferNgn: 900, etaSeconds: 60, ...extra });
  assert.equal(offersLib.mergeOffer([o({ driverRidesCompleted: 120 })], o({ counterOfferNgn: 800 }))[0].driverRidesCompleted, 120);
  assert.equal(offersLib.mergeOffer([o({ driverRidesCompleted: 120 })], o({ driverRidesCompleted: 121 }))[0].driverRidesCompleted, 121);
  const before = prev({ driverId: 'd1', driverRidesCompleted: 120 });
  assert.equal(matched.rideAfterMatched(before, { rideId: 'r1', driverId: 'd1' }).driver.driverRidesCompleted, 120);
  assert.equal(matched.rideAfterMatched(before, { rideId: 'r1', driverId: 'd1', driverRidesCompleted: 125 }).driver.driverRidesCompleted, 125);
  assert.equal(matched.rideAfterMatched(before, { rideId: 'r1', driverId: 'd2' }).driver.driverRidesCompleted, undefined);
  const r = active.restoredRideFrom(ride({ driver: { ...ride().driver, driverRidesCompleted: 77 } }));
  assert.equal(r.driver.driverRidesCompleted, 77);
  assert.equal('driverRidesCompleted' in active.restoredRideFrom(ride()).driver, false);
});

test('reputation line for each case', () => {
  const L = photo.reputationLine;
  assert.equal(L(4.8, 120), '4.8 \u2605 \u00b7 120 rides');
  assert.equal(L(4.8, 1), '4.8 \u2605 \u00b7 1 ride');
  assert.equal(L(4.8, null), '4.8 \u2605');
  assert.equal(L(4.8, 0), '4.8 \u2605');
  assert.equal(L(0, 120), '120 rides');
  assert.equal(L(undefined, 120), '120 rides');
  assert.equal(L(0, 0), 'New driver');
  assert.equal(L(0, null), null);
  assert.equal(L(undefined, undefined), null);
});

test('cache policy: memory for offer avatars, disk for the booked driver', () => {
  assert.equal(photo.avatarCachePolicy(true), 'memory');
  assert.equal(photo.avatarCachePolicy(false), 'disk');
  const src = (f) => readFileSync(join(root, f), 'utf8');
  assert.match(src('components/rider/offer-card.tsx'), /cache=\{avatarCachePolicy\(true\)\}/);
  for (const f of ['app/driver-found.tsx', 'app/rider/active-trip.tsx', 'app/rider-chat.tsx', 'components/rider/call-screen.tsx']) {
    assert.doesNotMatch(src(f), /cache=\{avatarCachePolicy\(true\)\}/, f);
  }
  assert.match(src('components/rider/kit.tsx'), /cache = "disk"/);
});
