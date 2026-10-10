/**
 * The driver's money, as the server works it out (lib/ride-fees.ts mirrors
 * packages/config/src/pricing.ts). New pricing: ₦350/km on 10 km is a ₦3,500
 * trip fare; + 7.5% VAT + ₦375 booking fee, rounded up to ₦50, is the ₦4,150
 * the rider sees; the driver is paid the trip fare less 10% and the ₦30 levy.
 * A ride agreed before the change keeps the old sums.
 *
 *   node --test __tests__/ride-fees.test.mjs
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
const outFile = join(mkdtempSync(join(tmpdir(), 'wheelers-ride-fees-')), 'bundle.cjs');
execFileSync('npx', ['esbuild', join(projectRoot, 'lib/ride-fees.ts'), '--bundle', '--platform=node', '--format=cjs', `--outfile=${outFile}`], { cwd: projectRoot, stdio: 'pipe' });
const {
  rideFees, driverRatePerKmNgn, formatPerKmNgn, fareFromRatePerKmNgn, suggestedRateBids, bidChoices, bidsPerKm,
  bidCeilingFareNgn, pricingVersionOf,
} = createRequire(import.meta.url)(outFile);

test('₦350/km on 10 km: the rider sees ₦4,150, the driver gets the trip fare less 10% and the levy', () => {
  assert.equal(fareFromRatePerKmNgn(350, 10), 4150);
  const f = rideFees(4150);
  assert.equal(f.bookingFeeNgn, 375);
  assert.equal(f.tripFareNgn, 3511.63);
  assert.equal(f.vatNgn, 263.37);
  assert.equal(f.commissionNgn, 351.16);
  assert.equal(f.stateLevyNgn, 30);
  assert.equal(f.driverPayoutNgn, 3130.47);
  assert.equal(fareFromRatePerKmNgn(300, 2), 2500, 'never under the minimum fare');
});

test('a ride agreed before the change: booking fee first, then 4% and 7.5% of the share, then the levy', () => {
  const f = rideFees(3500, 1);
  assert.equal(f.driverShareNgn, 3125);
  assert.equal(f.commissionNgn, 125);
  assert.equal(f.vatNgn, 234.38);
  assert.equal(f.driverPayoutNgn, 2735.62);
  assert.equal(pricingVersionOf(undefined), 1, 'an older server says nothing: the old rules');
  assert.equal(pricingVersionOf(2), 2);
});

test('per km is the trip fare over the distance, and moves with the price', () => {
  assert.equal(driverRatePerKmNgn(4150, 10), 351.2);
  assert.equal(driverRatePerKmNgn(3500, 10, 1), 312.5);
  assert.equal(driverRatePerKmNgn(3500, null), null);
  assert.equal(formatPerKmNgn(312.5), '₦312.5');
  assert.equal(formatPerKmNgn(350), '₦350');
});

test('one-tap bids are rates above the rider\'s, each with the fare the rider would see, never past the ceiling', () => {
  const offer = { pricingVersion: 2, plannedDistanceKm: 10, maxOfferNgn: 5900, maxRatePerKmNgn: 511 };
  assert.equal(bidsPerKm(offer), true);
  const bids = bidChoices(4450, offer); // the rider's ₦4,450 is ₦379.1/km
  assert.deepEqual(bids.map((b) => b.ratePerKmNgn), [395, 410, 425]);
  assert.deepEqual(bids.map((b) => b.fareNgn), [4650, 4800, 4950]);
  for (const b of bids) assert.equal(fareFromRatePerKmNgn(b.ratePerKmNgn, 10), b.fareNgn);
  const nearTop = suggestedRateBids(5800, 10, 511);
  assert.ok(nearTop.every((b) => b.ratePerKmNgn <= 511 && b.fareNgn <= 5900));
  assert.equal(bidCeilingFareNgn(4450, offer), 5900);
  assert.equal(bidCeilingFareNgn(7000, offer), 7000, 'a rider who offers more than the ceiling can still be taken up on it');
});

test('an old ride, or one with no distance, is still bid on as a fare', () => {
  assert.equal(bidsPerKm({ pricingVersion: 1, plannedDistanceKm: 10 }), false);
  assert.equal(bidsPerKm({ pricingVersion: 2 }), false);
  assert.deepEqual(bidChoices(4000, { pricingVersion: 1, plannedDistanceKm: 10 }).map((b) => b.fareNgn), [4200, 4600, 5000]);
  assert.equal(bidCeilingFareNgn(4000, { pricingVersion: 1 }), null);
});

test('a tiny fare never costs the driver money, and the lines always add up to the fare', () => {
  for (const version of [1, 2]) {
    for (const fare of [400, 2500, 4150, 12350]) {
      const f = rideFees(fare, version);
      assert.ok(f.driverPayoutNgn >= 0);
      assert.equal(Math.round((f.bookingFeeNgn + f.commissionNgn + f.vatNgn + f.stateLevyNgn + f.driverPayoutNgn) * 100) / 100, fare);
    }
  }
});
