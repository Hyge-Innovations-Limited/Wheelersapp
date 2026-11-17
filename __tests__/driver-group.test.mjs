/**
 * A group ride on the driver's side (Timi, 17 Nov 2026): one trip through every rider's stops in order. Each seat is
 * arrived, started and dropped on its own; a seat's ack never ends or moves back the trip.
 *
 *   node --test __tests__/driver-group.test.mjs
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
  const outFile = join(mkdtempSync(join(tmpdir(), 'wheelers-group-')), 'out.cjs');
  execFileSync('npx', ['esbuild', join(projectRoot, file), '--bundle', '--platform=node', '--format=cjs', `--outfile=${outFile}`], { cwd: projectRoot, stdio: 'pipe' });
  return req(outFile);
}

const G = build('lib/driver-group.ts');
const { reduceDriverSession, applyActiveRideSnapshot, defaultDriverSession } = build('lib/driver-session-reducer.ts');

const AT = Date.parse('2026-11-17T10:00:00Z');
const iso = (ms) => new Date(ms).toISOString();
const place = (address, lat, lng) => ({ address, lat, lng });
const seat = (rideId, riderName, status, extra = {}) => ({
  rideId, riderId: `u-${rideId}`, riderName, riderPhone: null, status, seatPriceNgn: rideId === 'A' ? 9000 : 6750,
  pickup: place(rideId === 'A' ? 'Yaba, Lagos' : 'Ketu', 6.5, 3.3), dropoff: place(rideId === 'A' ? 'Ikorodu Garage' : 'Mile 12', 6.6, 3.5),
  tripCodeRequired: true, ...extra,
});
const stops = [
  { rideId: 'A', kind: 'pickup', address: 'Yaba, Lagos', lat: 6.5095, lng: 3.3711, done: false },
  { rideId: 'B', kind: 'pickup', address: 'Ketu', lat: 6.596, lng: 3.391, done: false },
  { rideId: 'B', kind: 'dropoff', address: 'Mile 12', lat: 6.606, lng: 3.404, done: false },
  { rideId: 'A', kind: 'dropoff', address: 'Ikorodu Garage', lat: 6.619, lng: 3.51, done: false },
];
const snapshot = (rideStatus, seats) => ({
  rideId: 'TRIP', riderId: 'system', driverId: 'd1', rideStatus, paymentMethod: 'CASH',
  pickup: place('Yaba', 6.5095, 3.3711), destination: place('Ikorodu Garage', 6.619, 3.51), stops: [],
  agreedFareNgn: 15750, riderOfferNgn: null, riderPaid: true, riderPhone: null, tripCodeRequired: false,
  matchedAt: null, arrivedAt: null, startedAt: null,
  group: { seats, stops },
});
const step = (state, type, payload) => reduceDriverSession(state, type, payload, AT) ?? state;

test('the group in the snapshot: seats, stops in order, the next stop and what to do there', () => {
  const group = G.parseDriverGroup(snapshot('DRIVER_ASSIGNED', [seat('A', 'Ada', 'DRIVER_ASSIGNED'), seat('B', 'Chika', 'DRIVER_ASSIGNED')]).group);
  assert.equal(group.seats.length, 2);
  assert.deepEqual(group.stops.map((s) => `${s.kind}:${s.rideId}`), ['pickup:A', 'pickup:B', 'dropoff:B', 'dropoff:A']);
  let next = G.nextGroupStop(group);
  assert.deepEqual([next.stop.kind, next.seat.riderName, G.actionAt(next.stop, next.seat)], ['pickup', 'Ada', 'arrive']);
  // Ada picked up: Chika's pickup is next, then her drop-off before Ada's.
  const aboard = G.updateSeat(group, 'A', { status: 'IN_PROGRESS' });
  next = G.nextGroupStop(aboard);
  assert.deepEqual([next.stop.kind, next.seat.riderName], ['pickup', 'Chika']);
  const chikaGone = G.updateSeat(aboard, 'B', { status: 'CANCELLED' });
  next = G.nextGroupStop(chikaGone);
  assert.deepEqual([next.stop.kind, next.seat.riderName, G.actionAt(next.stop, next.seat)], ['dropoff', 'Ada', 'drop']);
  assert.equal(G.nextGroupStop(G.updateSeat(chikaGone, 'A', { status: 'COMPLETED' })), null);
  assert.equal(G.parseDriverGroup(undefined), undefined, 'a ride of one rider has no group');
  assert.equal(G.shortPlace('Yaba, Lagos'), 'Yaba');
});

test('seat by seat: each seat\'s ack moves that seat; the trip only forward and never ends on one drop-off', () => {
  let s = applyActiveRideSnapshot(defaultDriverSession, snapshot('DRIVER_ASSIGNED', [seat('A', 'Ada', 'DRIVER_ASSIGNED'), seat('B', 'Chika', 'DRIVER_ASSIGNED')]));
  assert.equal(s.status, 'navigating');
  assert.ok(s.currentRide.group);

  s = step(s, 'ride:arrived:ack', { rideId: 'A' });
  assert.deepEqual([s.status, G.seatOf(s.currentRide.group, 'A').status], ['arrived', 'ARRIVED']);
  assert.ok(G.seatOf(s.currentRide.group, 'A').waiting, 'the seat\'s own wait starts');
  assert.equal(s.currentRide.waiting, undefined, 'not the trip\'s');

  s = step(s, 'ride:start:accepted', { rideId: 'A' });
  assert.deepEqual([s.status, G.seatOf(s.currentRide.group, 'A').status], ['active', 'IN_PROGRESS']);

  // Chika's pickup while Ada rides: the trip stays active.
  s = step(s, 'ride:arrived:ack', { rideId: 'B' });
  assert.deepEqual([s.status, G.seatOf(s.currentRide.group, 'B').status], ['active', 'ARRIVED']);
  s = step(s, 'ride:group_update', { tripId: 'TRIP', rideId: 'B', seat: 'started' });
  s = step(s, 'ride:end:accepted', { rideId: 'B' });
  assert.deepEqual([s.status, s.currentRide.rideId, s.currentRide.completedAt], ['active', 'TRIP', undefined], 'one drop-off is not the end');
  s = step(s, 'ride:group_update', { tripId: 'TRIP', rideId: 'B', seat: 'dropped', fareNgn: 6750, driverEarningsNgn: 5900 });
  assert.equal(G.seatOf(s.currentRide.group, 'B').earnedNgn, 5900);

  s = step(s, 'ride:group_update', { tripId: 'TRIP', rideId: 'A', seat: 'dropped', fareNgn: 9000, driverEarningsNgn: 7900 });
  s = step(s, 'ride:group_done', { tripId: 'TRIP', ridersDropped: 2, faresNgn: 15750 });
  assert.equal(s.status, 'completed');
  assert.deepEqual(G.groupEarnings(s.currentRide.group), { dropped: 2, earnedNgn: 13800 });
});

test('a snapshot that has not caught up never moves a seat back', () => {
  let s = applyActiveRideSnapshot(defaultDriverSession, snapshot('ARRIVED', [seat('A', 'Ada', 'ARRIVED'), seat('B', 'Chika', 'DRIVER_ASSIGNED')]));
  s = step(s, 'ride:start:accepted', { rideId: 'A' });
  s = applyActiveRideSnapshot(s, snapshot('ARRIVED', [seat('A', 'Ada', 'ARRIVED'), seat('B', 'Chika', 'DRIVER_ASSIGNED')]));
  assert.deepEqual([s.status, G.seatOf(s.currentRide.group, 'A').status], ['active', 'IN_PROGRESS']);
});

test('everyone gone before they got in: over like a cancelled trip', () => {
  let s = applyActiveRideSnapshot(defaultDriverSession, snapshot('DRIVER_ASSIGNED', [seat('A', 'Ada', 'DRIVER_ASSIGNED'), seat('B', 'Chika', 'DRIVER_ASSIGNED')]));
  s = step(s, 'ride:group_update', { tripId: 'TRIP', rideId: 'A', seat: 'cancelled' });
  s = step(s, 'ride:group_done', { tripId: 'TRIP', ridersDropped: 0, faresNgn: 0 });
  assert.deepEqual([s.status, s.currentRide], ['online', null]);
});

test('Continue without them: only after the free minutes, never when they agreed a price', () => {
  const waiting = (waitedS, deal = {}) => ({
    freeSeconds: 300, ngnPerMinute: 0, now: iso(AT + waitedS * 1000), arrivedAt: iso(AT), stoppedAt: null, minutes: null, feeNgn: null, paid: null,
    deal: { rates: [40, 50, 60, 70, 80, 90, 100], baseFreeSeconds: 300, rateNgn: null, agreedAt: null, offer: null, offersLeft: 10, ...deal },
  });
  const at = (waitedS, deal) => G.parseDriverGroup({ seats: [seat('A', 'Ada', 'ARRIVED', { waiting: waiting(waitedS, deal) })], stops }, AT + waitedS * 1000).seats[0];
  assert.equal(G.canContinueWithout(at(120), AT + 120_000), false, 'free minutes');
  assert.equal(G.canContinueWithout(at(330), AT + 330_000), true);
  assert.equal(G.canContinueWithout(at(400, { rateNgn: 60, agreedAt: iso(AT + 320_000) }), AT + 400_000), false, 'they are paying for the wait');
  assert.equal(G.canContinueWithout(seat('A', 'Ada', 'DRIVER_ASSIGNED'), AT), false, 'not arrived');
});

test('a ride of one rider is untouched: its end still completes it', () => {
  const solo = { ...snapshot('IN_PROGRESS', []), rideId: 'SOLO', group: undefined };
  let s = applyActiveRideSnapshot(defaultDriverSession, solo);
  assert.equal(s.currentRide.group, undefined);
  s = step(s, 'ride:arrived:ack', { rideId: 'SOLO' });
  s = step(s, 'ride:end:accepted', { rideId: 'SOLO' });
  assert.equal(s.status, 'completed');
});
