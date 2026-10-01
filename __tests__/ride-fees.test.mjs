/**
 * The driver's money, as the server works it out: ₦3,500 on 10 km →
 * booking fee ₦375, share ₦3,125 (₦312.5/km), commission 4% and VAT 7.5% of
 * the share, ₦30 levy, paid ₦2,735.62.
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
const { rideFees, driverRatePerKmNgn, formatPerKmNgn } = createRequire(import.meta.url)(outFile);

test('₦3,500: booking fee first, then 4% and 7.5% of the share, then the levy', () => {
  const f = rideFees(3500);
  assert.equal(f.bookingFeeNgn, 375);
  assert.equal(f.driverShareNgn, 3125);
  assert.equal(f.commissionNgn, 125);
  assert.equal(f.vatNgn, 234.38);
  assert.equal(f.stateLevyNgn, 30);
  assert.equal(f.driverPayoutNgn, 2735.62);
});

test('per km is the share over the distance, and moves with the price', () => {
  assert.equal(driverRatePerKmNgn(3500, 10), 312.5);
  assert.equal(driverRatePerKmNgn(4000, 10), 362.5);
  assert.equal(driverRatePerKmNgn(3500, null), null);
  assert.equal(formatPerKmNgn(312.5), '₦312.5');
  assert.equal(formatPerKmNgn(350), '₦350');
});

test('a tiny fare never costs the driver money', () => {
  const f = rideFees(400);
  assert.ok(f.driverPayoutNgn >= 0);
  assert.equal(Math.round((f.bookingFeeNgn + f.commissionNgn + f.vatNgn + f.stateLevyNgn + f.driverPayoutNgn) * 100) / 100, 400);
});
