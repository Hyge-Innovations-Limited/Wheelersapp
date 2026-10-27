/**
 * The pay sheet on Accept: "Pay ₦X" when the wallet covers it, "Add ₦Y" when
 * it does not, and the accept sent by itself once the money lands, unless the
 * rider backed out.
 *
 *   node --test __tests__/ride-pay.test.mjs
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
const outFile = join(mkdtempSync(join(tmpdir(), 'wheelers-ride-pay-')), 'bundle.cjs');
execFileSync('npx', ['esbuild', join(projectRoot, 'lib/ride-pay.ts'), '--bundle', '--platform=node', '--format=cjs', `--outfile=${outFile}`], { cwd: projectRoot, stdio: 'pipe' });
const { walletShortNgn, paySheetStep, shouldSendAfterTopUp, canAcceptOffers } = createRequire(import.meta.url)(outFile);

test('enough in the wallet: pay', () => {
  assert.deepEqual(paySheetStep(5000, 4500), { kind: 'pay', fareNgn: 4500 });
  assert.deepEqual(paySheetStep(4500, 4500), { kind: 'pay', fareNgn: 4500 });
});

test('short: add the difference, rounded up to whole naira', () => {
  assert.deepEqual(paySheetStep(3000, 4500), { kind: 'add', fareNgn: 4500, shortNgn: 1500 });
  assert.equal(walletShortNgn(4499.5, 4500), 1);
  assert.equal(walletShortNgn(0, 4500), 4500);
});

test('balance not known yet: pay (the server checks again)', () => {
  assert.deepEqual(paySheetStep(null, 4500), { kind: 'pay', fareNgn: 4500 });
  assert.equal(walletShortNgn(undefined, 4500), 0);
});

test('the accept goes once the money lands, never after Back, never on an unknown balance', () => {
  const base = { waitingForMoney: true, backedOut: false, balanceNgn: 5000, fareNgn: 4500, agreedFareNgn: 4500, rideStatus: 'bidding', sending: false };
  assert.equal(shouldSendAfterTopUp(base), true);
  assert.equal(shouldSendAfterTopUp({ ...base, balanceNgn: 4000 }), false, 'still short');
  assert.equal(shouldSendAfterTopUp({ ...base, backedOut: true }), false, 'backed out');
  assert.equal(shouldSendAfterTopUp({ ...base, waitingForMoney: false }), false, 'was never short: Pay is tapped');
  assert.equal(shouldSendAfterTopUp({ ...base, balanceNgn: null }), false);
  assert.equal(shouldSendAfterTopUp({ ...base, sending: true }), false, 'one accept at a time');
});

test('the auto-book line needs a known balance that covers the price', async () => {
  const { walletCovers } = createRequire(import.meta.url)(outFile);
  assert.equal(walletCovers(5000, 4500), true);
  assert.equal(walletCovers(4500, 4500), true);
  assert.equal(walletCovers(4000, 4500), false);
  assert.equal(walletCovers(null, 4500), false);
  assert.equal(walletCovers(5000, undefined), false);
});

test('the driver re-bid while the rider topped up: never booked at the new price by itself', () => {
  const base = { waitingForMoney: true, backedOut: false, balanceNgn: 3500, fareNgn: 3400, agreedFareNgn: 3000, rideStatus: 'bidding', sending: false };
  assert.equal(shouldSendAfterTopUp(base), false, '₦3,400 was never agreed');
  assert.equal(shouldSendAfterTopUp({ ...base, fareNgn: 3000 }), true, 'the agreed price still stands');
});

test('no accept by itself once the ride is booked, confirming, or the search ended', () => {
  const base = { waitingForMoney: true, backedOut: false, balanceNgn: 5000, fareNgn: 4500, agreedFareNgn: 4500, rideStatus: 'bidding', sending: false };
  for (const rideStatus of ['matched', 'matching', 'active', 'cancelled', undefined]) {
    assert.equal(shouldSendAfterTopUp({ ...base, rideStatus }), false, String(rideStatus));
  }
  assert.equal(shouldSendAfterTopUp({ ...base, searchEnded: true }), false);
});

test('an accept is only sent on an open search', () => {
  assert.equal(canAcceptOffers({ status: 'bidding' }), true);
  assert.equal(canAcceptOffers({ status: 'bidding', bidTimeout: true }), false);
  assert.equal(canAcceptOffers({ status: 'matched' }), false, 'auto-accept booked another driver');
  assert.equal(canAcceptOffers({ status: 'matching' }), false);
  assert.equal(canAcceptOffers(null), false);
});

test('"busy" (another booking attempt held the ride): back to the offers, all of them, "Try again."', () => {
  const { acceptRefusalText, offersAfterRefusal } = createRequire(import.meta.url)(outFile);
  const held = [{ driverId: 'a' }, { driverId: 'b' }];
  assert.deepEqual(offersAfterRefusal(held, 'busy', 'a'), held);
  assert.equal(acceptRefusalText('busy', 'Try again.'), 'Try again.');
  assert.equal(acceptRefusalText('busy', undefined), 'Try again.');
  assert.deepEqual(offersAfterRefusal(held, 'driver_unavailable', 'a'), [{ driverId: 'b' }], 'a driver who is gone still leaves');
  assert.deepEqual(offersAfterRefusal(held, 'insufficient_funds', 'a'), held);
});
