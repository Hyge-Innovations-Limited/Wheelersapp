/**
 * Fixing a rejection walks only what was sent back, in order, and the last
 * of those steps sends. A new application walks all five.
 *
 *   node --test __tests__/kyc-steps.test.mjs
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
const outFile = join(mkdtempSync(join(tmpdir(), 'wheelers-kyc-steps-')), 'bundle.cjs');
execFileSync('npx', ['esbuild', join(projectRoot, 'lib/kyc-steps.ts'), '--bundle', '--platform=node', '--format=cjs', `--outfile=${outFile}`], { cwd: projectRoot, stdio: 'pipe' });
const { fixStepsFrom, nextKycStep, kycProgress, stepsToWalk, KYC_STEPS } = createRequire(import.meta.url)(outFile);

test('a new application walks every step, and the photos send it', () => {
  assert.deepEqual(stepsToWalk(null), [...KYC_STEPS]);
  assert.equal(nextKycStep('nin', null), 'licence');
  assert.equal(nextKycStep('vehicle', null), 'vehiclePhotos');
  assert.equal(nextKycStep('vehiclePhotos', null), null);
  assert.deepEqual(kycProgress('nin', null), { count: 6, active: 1 }, 'the welcome screen is step 0');
});

test('sent back for the licence only: one step, and it sends', () => {
  const fix = fixStepsFrom(['licence']);
  assert.deepEqual(fix, ['licence']);
  assert.equal(nextKycStep('licence', fix), null);
  assert.deepEqual(kycProgress('licence', fix), { count: 1, active: 0 });
});

test('several items: in the order a driver fills them in, skipping everything approved', () => {
  const fix = fixStepsFrom(['vehiclePhotos', 'nin', 'unknown']);
  assert.deepEqual(fix, ['nin', 'vehiclePhotos']);
  assert.equal(nextKycStep('nin', fix), 'vehiclePhotos');
  assert.equal(nextKycStep('vehiclePhotos', fix), null);
});

test('nothing named means the whole application', () => {
  assert.deepEqual(fixStepsFrom([]), [...KYC_STEPS]);
  assert.deepEqual(fixStepsFrom(undefined), [...KYC_STEPS]);
});
