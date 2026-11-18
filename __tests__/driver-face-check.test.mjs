/**
 * The driver's face check before every ride (18 Nov 2026): ride:matched carries the scan due; passed clears it;
 * failed (or no scan in time) ends the ride on this phone; a resync with none due clears it.
 *
 *   node --test __tests__/driver-face-check.test.mjs
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
const dir = mkdtempSync(join(tmpdir(), 'wheelers-face-'));
const build = (file, out) => {
  execFileSync('npx', ['esbuild', join(projectRoot, file), '--bundle', '--platform=node', '--format=cjs', `--outfile=${join(dir, out)}`], { cwd: projectRoot, stdio: 'pipe' });
  return createRequire(import.meta.url)(join(dir, out));
};
const R = build('lib/driver-session-reducer.ts', 'reducer.cjs');
const F = build('lib/driver-face-check.ts', 'face.cjs');

const PICKUP = { lat: 6.6018, lng: 3.3515, address: '102 Opebi Rd, Ikeja' };
const DEST = { lat: 6.4969, lng: 3.3556, address: '15 Aiyetoro St, Surulere' };
const CHECK = { checkId: 'fc-1', rideId: 'ride-1', challenge: 'right', deadlineAt: '2026-11-18T10:02:00.000Z', triesLeft: 3, mode: 'on' };
const matched = (extra = {}) => ({ rideId: 'ride-1', riderId: 'rider-1', rideStatus: 'DRIVER_ASSIGNED', pickup: PICKUP, destination: DEST, agreedFareNgn: 5000, ...extra });
const booked = (extra) => R.reduceDriverSession({ ...R.defaultDriverSession, status: 'online' }, 'ride:matched', matched(extra));

test('booked with a scan due: the ride carries it, and the scan screen is due', () => {
  const s = booked({ faceCheck: CHECK });
  assert.equal(s.status, 'navigating');
  assert.deepEqual(s.currentRide.faceCheck, { checkId: 'fc-1', challenge: 'right', deadlineAt: CHECK.deadlineAt, triesLeft: 3, mode: 'on' });
  assert.equal(F.faceScanDue(s.currentRide), true);
  assert.equal(F.faceScanDue(booked().currentRide), false, 'none sent (check off, older server): nothing due');
  assert.equal(F.faceScanDue({ ...s.currentRide, group: { seats: [] } }), false, 'never on a group trip');
});

test('passed clears it; a resync with none due clears it; another ride\'s message is ignored', () => {
  const s = booked({ faceCheck: CHECK });
  assert.equal(R.reduceDriverSession(s, 'ride:face_check:passed', { rideId: 'other' }), s);
  assert.equal(R.reduceDriverSession(s, 'ride:face_check:passed', { rideId: 'ride-1' }).currentRide.faceCheck, undefined);
  assert.equal(R.reduceDriverSession(s, 'ride:matched', matched({ resync: true })).currentRide.faceCheck, undefined);
  assert.equal(R.reduceDriverSession(s, 'ride:matched', matched({ faceCheck: CHECK, resync: true })).currentRide.faceCheck.checkId, 'fc-1');
});

test('failed: the ride is gone from this phone and the driver is back online', () => {
  const s = R.reduceDriverSession(booked({ faceCheck: CHECK }), 'ride:face_check:failed', { rideId: 'ride-1', reason: 'x' });
  assert.equal(s.currentRide, null);
  assert.equal(s.status, 'online');
});

test('the HTTP snapshot carries it too (an app opened mid-check)', () => {
  const s = R.applyActiveRideSnapshot({ ...R.defaultDriverSession, status: 'online' }, {
    rideId: 'ride-1', riderId: 'rider-1', rideStatus: 'DRIVER_ASSIGNED', pickup: PICKUP, destination: DEST, stops: [], agreedFareNgn: 5000,
    pricingVersion: 2, riderPaid: true, tripCodeRequired: false, faceCheck: CHECK,
  });
  assert.equal(s.currentRide.faceCheck.checkId, 'fc-1');
});

test('the answers and the words', () => {
  assert.deepEqual(F.parseFaceScanAnswer({ status: 'passed' }), { status: 'passed' });
  assert.deepEqual(F.parseFaceScanAnswer({ status: 'retry', reason: 'Closer', challenge: 'left', triesLeft: 2 }), { status: 'retry', reason: 'Closer', challenge: 'left', triesLeft: 2 });
  assert.equal(F.parseFaceScanAnswer({ status: 'weird' }).status, 'none');
  assert.equal(F.parseFaceScanAnswer(null).status, 'none');
  assert.equal(F.parseFaceCheck({ checkId: 'x' }), undefined, 'no deadline: not a check');
  assert.deepEqual(F.SCAN_STEPS, ['straight', 'turn', 'again']);
  assert.equal(F.stepWords('turn', 'left'), 'Turn your head left');
  assert.equal(F.stepWords('turn', 'right'), 'Turn your head right');
  assert.equal(F.stepWords('straight', 'left'), 'Look at the camera');
  const at = Date.parse(CHECK.deadlineAt);
  assert.equal(F.secondsLeft(CHECK.deadlineAt, at - 90_500), 91);
  assert.equal(F.secondsLeft(CHECK.deadlineAt, at + 5000), 0);
});
