/**
 * Trip details (people, luggage, pet, a note): what the rider sets on Set
 * your price goes out cleaned, and the driver keeps it from the request card
 * through the bid and the match to the pickup, also after a restart.
 *
 *   node --test __tests__/trip-details.test.mjs
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
const req = createRequire(import.meta.url);

function build(file) {
  const outFile = join(mkdtempSync(join(tmpdir(), 'wheelers-trip-details-')), 'out.cjs');
  execFileSync('npx', [
    'esbuild', join(projectRoot, file),
    '--bundle', '--platform=node', '--format=cjs', `--outfile=${outFile}`,
  ], { cwd: projectRoot, stdio: 'pipe' });
  return req(outFile);
}

const { reduceDriverSession, recordBid, applyActiveRideSnapshot, defaultDriverSession } = build('lib/driver-session-reducer.ts');
const { tripDetailsOut, parseTripDetails, peopleLabel, nextPassengers, DEFAULT_TRIP_DETAILS } = build('lib/trip-details.ts');

const PICKUP = { lat: 6.6018, lng: 3.3515, address: '102 Opebi Rd, Ikeja' };
const DEST = { lat: 6.4969, lng: 3.3556, address: '15 Aiyetoro St, Surulere' };
const NOW = Date.parse('2026-11-07T12:00:00.000Z');
const DETAILS = { passengers: 3, luggage: true, pet: true, note: 'Small dog in a carrier' };

function offer(extra = {}) {
  return {
    rideId: 'ride-1', riderId: 'rider-1', pickup: PICKUP, destination: DEST, stops: [],
    fareEstimateNgn: 5200, riderOfferNgn: 6000, expiresAt: new Date(NOW + 30_000).toISOString(),
    ...extra,
  };
}

test('what Set your price sends: whole people 1-4, one-line note, none when empty', () => {
  assert.deepEqual(tripDetailsOut(DEFAULT_TRIP_DETAILS), { passengers: 1, luggage: true, pet: true }, 'untouched: luggage and pet Yes');
  assert.deepEqual(tripDetailsOut({ passengers: 9, luggage: true, pet: false, note: '  Two \n boxes ' }), { passengers: 4, luggage: true, pet: false, note: 'Two boxes' });
  assert.deepEqual(tripDetailsOut({ passengers: 0, luggage: false, pet: false, note: '   ' }), { passengers: 1, luggage: false, pet: false });
  assert.equal(tripDetailsOut({ passengers: 1, luggage: false, pet: false, note: 'x'.repeat(80) }).note.length, 60);
  // Never half an emoji at the 60th character.
  assert.equal(tripDetailsOut({ passengers: 1, luggage: false, pet: false, note: 'a'.repeat(59) + String.fromCodePoint(0x1f600) }).note, 'a'.repeat(59));
  // The matching screen gets it as a route param.
  assert.deepEqual(parseTripDetails(JSON.stringify(DETAILS)), DETAILS);
  assert.deepEqual(parseTripDetails([JSON.stringify(DETAILS)]), DETAILS);
  assert.equal(parseTripDetails('not json'), undefined);
  assert.equal(parseTripDetails(undefined), undefined);
  assert.equal(parseTripDetails({ luggage: true }), undefined, 'no people: not trip details');
  assert.equal(peopleLabel(1), '1 person');
  assert.equal(peopleLabel(3), '3 people');
});

test('the driver sees them on the request, keeps them through the bid and the match, and after a restart', () => {
  let s = reduceDriverSession({ ...defaultDriverSession, status: 'online' }, 'ride:offer', offer({ tripDetails: DETAILS }), NOW);
  assert.deepEqual(s.currentOffer.tripDetails, DETAILS, 'on the request card');

  s = recordBid(s, s.currentOffer, 6500, new Date(NOW).toISOString());
  assert.deepEqual(s.pendingBids['ride-1'].offer.tripDetails, DETAILS, 'on the bid card');

  // A match without them (an older server): the bid card's are kept.
  s = reduceDriverSession(s, 'ride:matched', { rideId: 'ride-1', riderId: 'rider-1', agreedFareNgn: 6500, riderPaid: true }, NOW + 60_000);
  assert.deepEqual(s.currentRide.tripDetails, DETAILS, 'at the pickup');

  // The app restarted mid-trip: rebuilt from the server's snapshot.
  const restarted = applyActiveRideSnapshot({ ...defaultDriverSession, status: 'online' }, {
    rideId: 'ride-1', tripId: 'WH-00001', riderId: 'rider-1', driverId: 'd-1', rideStatus: 'DRIVER_ASSIGNED', paymentMethod: 'WALLET',
    pickup: PICKUP, destination: DEST, stops: [], agreedFareNgn: 6500, pricingVersion: 4, riderOfferNgn: 6000, riderPaid: true,
    riderPhone: null, riderName: 'Ada', tripCodeRequired: true, matchedAt: null, arrivedAt: null, startedAt: null,
    tripDetails: { passengers: 2, luggage: false, pet: true },
  });
  assert.deepEqual(restarted.currentRide.tripDetails, { passengers: 2, luggage: false, pet: true });
});

test('a request booked without them (older apps, chat) has none, and nothing breaks', () => {
  const s = reduceDriverSession({ ...defaultDriverSession, status: 'online' }, 'ride:offer', offer(), NOW);
  assert.equal(s.currentOffer.tripDetails, undefined);
  const bad = reduceDriverSession({ ...defaultDriverSession, status: 'online' }, 'ride:offer', offer({ tripDetails: 'three' }), NOW);
  assert.equal(bad.currentOffer.tripDetails, undefined);
});

test('a search brought back from the server (app restarted) keeps its details, so search again sends them', () => {
  const { restoredRideFrom } = build('lib/rider-active-ride.ts');
  const ride = {
    id: 'ride-9', tripId: 'WH-00009', status: 'MATCHING', pickup: PICKUP, destination: DEST, stops: [{ type: 'FINAL', address: DEST.address }],
    fareEstimateNgn: 5200, riderOfferNgn: 6000, autoAccept: false,
    search: { bidsCloseAt: new Date(Date.now() + 60_000).toISOString(), offers: [] },
    tripDetails: DETAILS,
  };
  assert.deepEqual(restoredRideFrom(ride).tripDetails, DETAILS);
  const { tripDetails: _, ...older } = ride;
  assert.equal(restoredRideFrom(older).tripDetails, undefined, 'an older server: none');
});

test('the People chip: each tap adds one, past 4 it goes back to 1', () => {
  assert.deepEqual([1, 2, 3, 4].map(nextPassengers), [2, 3, 4, 1]);
});
