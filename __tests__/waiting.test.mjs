/**
 * Waiting time (Timi, 12 Nov 2026): 5 free minutes after Arrived, then ₦70 a
 * minute until the trip starts. The app shows the meter on the server's clock;
 * the driver session keeps it from Arrived to the payout sheet.
 *
 *   node --test __tests__/waiting.test.mjs
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
  const outFile = join(mkdtempSync(join(tmpdir(), 'wheelers-waiting-')), 'out.cjs');
  execFileSync('npx', ['esbuild', join(projectRoot, file), '--bundle', '--platform=node', '--format=cjs', `--outfile=${outFile}`], { cwd: projectRoot, stdio: 'pipe' });
  return req(outFile);
}

const W = build('lib/waiting.ts');
const { reduceDriverSession, applyActiveRideSnapshot, defaultDriverSession } = build('lib/driver-session-reducer.ts');
const { waitingFields } = build('lib/rider-active-ride.ts');

const AT = Date.parse('2026-11-12T10:00:00Z');
const iso = (ms) => new Date(ms).toISOString();
const block = (waitedS, extra = {}) => ({ freeSeconds: 300, ngnPerMinute: 70, now: iso(AT + waitedS * 1000), arrivedAt: iso(AT), stoppedAt: null, minutes: null, feeNgn: null, paid: null, ...extra });

test('the meter runs on the server clock, whatever the phone says', () => {
  const phoneNow = AT + 3 * 60 * 60 * 1000;   // the phone is 3 hours out
  const info = W.parseWaiting(block(48), phoneNow);
  const clock = W.waitingClock(info, phoneNow);
  assert.equal(clock.free, true);
  assert.equal(W.minutesSeconds(clock.freeLeftSeconds), '4:12');
  const later = W.waitingClock(info, phoneNow + (300 - 48 + 3 * 60 + 20) * 1000);
  assert.deepEqual([later.free, later.chargedMinutes, later.feeNgn, later.stopped], [false, 3, 210, false]);
});

test('a stopped meter stays where it stopped', () => {
  const info = W.parseWaiting(block(900, { stoppedAt: iso(AT + 540 * 1000) }), AT);
  const clock = W.waitingClock(info, AT + 99 * 60 * 1000);
  assert.deepEqual([clock.waitedSeconds, clock.chargedMinutes, clock.feeNgn, clock.stopped], [540, 4, 280, true]);
});

test('no block, or no arrival: nothing; the rider\'s line matches the server\'s words', () => {
  assert.equal(W.parseWaiting(null), undefined);
  assert.equal(W.parseWaiting({ freeSeconds: 300 }), undefined);
  assert.equal(W.waitingLineForRider({ minutes: 4, feeNgn: 280, paid: true }), 'Waiting time: 4 min · ₦280, paid from your wallet.');
  assert.equal(W.waitingLineForRider({ minutes: 4, feeNgn: 280, paid: false }), "Waiting time: 4 min · ₦280. Your wallet couldn't cover it, so pay your driver.");
  assert.equal(W.waitingLineForRider(null), null);
  assert.deepEqual(W.parseWaitingResult({ waitingMinutes: 4, waitingFeeNgn: 280, waitingPaid: true }), { minutes: 4, feeNgn: 280, paid: true });
  assert.equal(W.parseWaitingResult({ fareNgn: 5000 }), null, 'a completion with no waiting');
});

test('rider restore: the meter while matched, the line once started', () => {
  assert.equal(waitingFields(block(48), 'matched', AT + 48_000).waiting.arrivedAtMs, AT);
  assert.deepEqual(waitingFields(block(0, { minutes: 4, feeNgn: 280, paid: false }), 'active'), { waitingLine: "Waiting time: 4 min · ₦280. Your wallet couldn't cover it, so pay your driver." });
  assert.deepEqual(waitingFields(undefined, 'matched'), {});
});

const ride = { rideId: 'ride-1', riderId: 'rider-1', pickup: { lat: 6.5, lng: 3.3, address: 'Yaba' }, destination: { lat: 6.6, lng: 3.5, address: 'Ikorodu' }, stops: [], fareNgn: 5000, pricingVersion: 4 };

test('driver: Arrived starts the meter here; the server\'s snapshot takes over', () => {
  let s = { ...defaultDriverSession, status: 'en_route', currentRide: { ...ride } };
  s = reduceDriverSession(s, 'ride:arrived:ack', { rideId: 'ride-1' }, AT);
  assert.equal(s.status, 'arrived');
  assert.deepEqual(s.currentRide.waiting, { freeSeconds: 300, ngnPerMinute: 70, arrivedAtMs: AT, stoppedAtMs: null, skewMs: 0 });
  s = applyActiveRideSnapshot(s, { rideId: 'ride-1', riderId: 'rider-1', driverId: 'd', rideStatus: 'ARRIVED', paymentMethod: 'WALLET', pickup: ride.pickup, destination: ride.destination, stops: [], agreedFareNgn: 5000, riderOfferNgn: 5000, riderPaid: true, riderPhone: null, waiting: block(20, { arrivedAt: iso(AT - 15_000) }) });
  assert.equal(s.currentRide.waiting.arrivedAtMs, AT - 15_000, 'the server\'s arrival wins');
});

test('driver: the payout sheet gets the waiting from the completion, kept past the end ack', () => {
  let s = { ...defaultDriverSession, status: 'active', currentRide: { ...ride } };
  s = reduceDriverSession(s, 'ride:completed', { rideId: 'ride-1', fareNgn: 5000, waitingMinutes: 4, waitingFeeNgn: 280, waitingPaid: true }, AT);
  assert.deepEqual(s.currentRide.waitingResult, { minutes: 4, feeNgn: 280, paid: true });
  s = reduceDriverSession(s, 'ride:end:accepted', { rideId: 'ride-1' }, AT);
  assert.deepEqual(s.currentRide.waitingResult, { minutes: 4, feeNgn: 280, paid: true }, 'not wiped by the other message');
});
