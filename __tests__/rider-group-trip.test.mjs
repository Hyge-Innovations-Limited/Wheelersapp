/**
 * A group ride on the rider's trip (Timi, 17 Nov 2026): who else is in the car and every stop in order, the rider's
 * own marked; others by first name and area only. Restored with the trip after a restart.
 *
 *   node --test __tests__/rider-group-trip.test.mjs
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
  const outFile = join(mkdtempSync(join(tmpdir(), 'wheelers-rgroup-')), 'out.cjs');
  execFileSync('npx', ['esbuild', join(projectRoot, file), '--bundle', '--platform=node', '--format=cjs', `--outfile=${outFile}`], { cwd: projectRoot, stdio: 'pipe' });
  return req(outFile);
}

const G = build('lib/rider-group-trip.ts');
const { restoredRideFrom } = build('lib/rider-active-ride.ts');

const group = { others: ['Ada'], stops: [
  { kind: 'pickup', name: 'Ada', area: 'Yaba', yours: false, done: true },
  { kind: 'pickup', name: 'You', area: 'Ketu', yours: true, done: false },
  { kind: 'dropoff', name: 'You', area: 'Mile 12', yours: true, done: false },
  { kind: 'dropoff', name: 'Ada', area: 'Ikorodu Garage', yours: false, done: false },
] };

test('the lines: who, where, in the rider\'s own words', () => {
  const parsed = G.parseRiderGroupTrip(group);
  assert.equal(G.groupTripTitle(parsed), 'Group ride · with Ada');
  assert.deepEqual(parsed.stops.map(G.groupStopLine), ['Ada gets in · Yaba', 'You get in · Ketu', 'You get out · Mile 12', 'Ada gets out · Ikorodu Garage']);
  assert.equal(G.groupTripTitle({ others: [], stops: parsed.stops }), 'Group ride');
  assert.equal(G.parseRiderGroupTrip(null), undefined);
  assert.equal(G.parseRiderGroupTrip({ others: [], stops: [{ kind: 'nope' }] }), undefined);
});

test('restored with the trip; a ride of one rider has none', () => {
  const ride = {
    id: 'ride-1', status: 'DRIVER_ASSIGNED', agreedFareNgn: 6750, tripCode: '1234',
    pickup: { lat: 6.596, lng: 3.391, address: 'Ketu' }, destination: { lat: 6.606, lng: 3.404, address: 'Mile 12' },
    stops: [{ type: 'DESTINATION', address: 'Mile 12' }], fareEstimateNgn: 6750, startedAt: null,
    driver: { id: 'd1', userId: 'u1', name: 'Tunde', phone: null, rating: 4.9, vehicleMake: 'Toyota', vehicleModel: 'Corolla', vehiclePlate: 'ABC' },
  };
  assert.deepEqual(restoredRideFrom({ ...ride, group }).group.others, ['Ada']);
  assert.equal(restoredRideFrom(ride).group, undefined);
});
