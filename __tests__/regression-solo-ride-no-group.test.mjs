/**
 * Regression guard (17 Nov 2026): the new OTA app against the OLD server (and any ride with no group). Nothing a solo
 * ride does may change because group-ride code exists. Payloads here carry no `group`, `groupOffer`, `groupFormed`
 * or `groupCounter`, exactly what a server from before group rides sends.
 *
 *   node --test __tests__/regression-solo-ride-no-group.test.mjs
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
const req = createRequire(import.meta.url);
function build(file) {
  const outFile = join(mkdtempSync(join(tmpdir(), 'wheelers-reg-')), 'out.cjs');
  execFileSync('npx', ['esbuild', join(projectRoot, file), '--bundle', '--platform=node', '--format=cjs', `--outfile=${outFile}`], { cwd: projectRoot, stdio: 'pipe' });
  return req(outFile);
}
const { reduceDriverSession, applyActiveRideSnapshot, defaultDriverSession } = build('lib/driver-session-reducer.ts');
const { restoredRideFrom } = build('lib/rider-active-ride.ts');
const G = build('lib/driver-group.ts');
const O = build('lib/group-offer.ts');

const NOW = Date.parse('2026-11-17T10:00:00.000Z');
const PICKUP = { lat: 6.6, lng: 3.35, address: 'Opebi, Ikeja' };
const DEST = { lat: 6.49, lng: 3.35, address: 'Surulere' };

test('driver: solo matched -> arrived -> started -> completed behaves as before, with no group anywhere', () => {
  let s = reduceDriverSession({ ...defaultDriverSession, status: 'online' }, 'ride:matched', {
    rideId: 'r1', riderId: 'u1', pickup: PICKUP, destination: DEST, agreedFareNgn: 6000, lockedFareNgn: 6000,
    riderPaid: true, paymentMethod: 'WALLET', riderPhone: '+2348000000000', riderName: 'Ada',
  }, NOW);
  assert.equal(s.status, 'navigating');
  assert.equal(s.currentRide.rideId, 'r1');
  assert.equal(s.currentRide.group, undefined);
  s = reduceDriverSession(s, 'ride:arrived:ack', { rideId: 'r1' }, NOW + 1000);
  assert.equal(s.status, 'arrived');
  s = reduceDriverSession(s, 'ride:start:accepted', { rideId: 'r1' }, NOW + 2000);
  assert.equal(s.status, 'active');
  s = reduceDriverSession(s, 'ride:completed', { rideId: 'r1', fareNgn: 6000 }, NOW + 3000);
  assert.equal(s.status, 'completed');
  assert.equal(s.currentRide.group, undefined);
});

test('driver: a group message for a ride that is not a group ride changes nothing and does not throw', () => {
  const online = { ...defaultDriverSession, status: 'online' };
  const s = reduceDriverSession(online, 'ride:matched', { rideId: 'r1', riderId: 'u1', pickup: PICKUP, destination: DEST, agreedFareNgn: 6000, riderPaid: true }, NOW);
  const same = reduceDriverSession(s, 'ride:arrived:ack', { rideId: 'someone-elses' }, NOW + 1);
  assert.equal(same.currentRide.rideId, 'r1');
  assert.equal(same.currentRide.group, undefined);
  // The solo seat branch must not claim a solo ride's own ack.
  const own = reduceDriverSession(s, 'ride:arrived:ack', { rideId: 'r1' }, NOW + 1);
  assert.equal(own.status, 'arrived');
  // ride:group_done for a ride that is not the current one is ignored.
  assert.equal(reduceDriverSession(s, 'ride:group_done', { tripId: 'other', ridersDropped: 1 }, NOW + 1).currentRide.rideId, 'r1');
});

test('driver: a snapshot from an old server (no group) keeps the ride and adds no group', () => {
  const s = reduceDriverSession({ ...defaultDriverSession, status: 'online' }, 'ride:matched', { rideId: 'r1', riderId: 'u1', pickup: PICKUP, destination: DEST, agreedFareNgn: 6000, riderPaid: true }, NOW);
  assert.equal(G.parseDriverGroup(undefined), undefined);
  assert.equal(G.parseDriverGroup(null), undefined);
  assert.equal(G.mergeGroup(undefined, undefined), undefined);
  assert.ok(applyActiveRideSnapshot);
  assert.equal(s.currentRide.group, undefined);
});

test('rider: restoring a trip or a search from an old server has no group fields set', () => {
  const base = {
    id: 'r1', tripId: 'WH-1', status: 'ARRIVED', pickup: { lat: 6.5, lng: 3.37, address: 'Yaba' }, destination: { lat: 6.45, lng: 3.43, address: 'Lekki' },
    stops: [{ type: 'DESTINATION', address: 'Lekki' }], fareEstimateNgn: 4000, agreedFareNgn: 3500, startedAt: null, tripCode: '4821',
    driver: { id: 'd1', userId: 'u1', name: 'Tunde', phone: null, rating: 4.8, vehicleMake: 'Toyota', vehicleModel: 'Corolla', vehiclePlate: 'KJA-1' },
  };
  const trip = restoredRideFrom(base, NOW);
  assert.equal(trip.status, 'matched');
  assert.equal(trip.group, undefined);
  assert.ok(!('group' in trip));
  const search = restoredRideFrom({ ...base, status: 'MATCHING', driver: null, tripCode: null, agreedFareNgn: null, riderOfferNgn: 6000, search: { bidsCloseAt: '2026-11-17T10:20:00Z', offers: [] } }, NOW);
  assert.ok(search && search.status === 'bidding');
  assert.equal(search.groupOffer ?? null, null);
  assert.equal(search.groupFormed ?? null, null);
  assert.equal(search.groupCounter ?? null, null);
});

test('rider: group parsers return nothing, never throw, for missing or junk input', () => {
  for (const v of [undefined, null, 0, '', 'x', [], {}, { riders: 'x' }]) {
    assert.doesNotThrow(() => { O.parseGroupOffer(v); O.parseGroupFormed(v); O.parseGroupCounter(v); });
    assert.equal(O.parseGroupOffer(v) ?? null, null);
    assert.equal(O.parseGroupCounter(v) ?? null, null);
  }
});
