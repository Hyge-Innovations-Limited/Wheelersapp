/**
 * Where a driver goes: only a driver the SERVER has approved reaches the
 * dashboard. Reopening the app used to skip the check and let a driver who
 * had only typed their email walk into the dashboard. Run against the real
 * post-auth and driver-kyc modules, with the server's answer stubbed.
 *
 *   node --test __tests__/driver-kyc-routing.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const projectRoot = join(here, '..');
const dir = mkdtempSync(join(tmpdir(), 'wheelers-kyc-'));
const entry = join(dir, 'entry.ts');
writeFileSync(entry, `
export * from '${join(projectRoot, 'lib/post-auth.ts')}';
export * from '${join(projectRoot, 'lib/driver-kyc.ts')}';
export { clearStoredAuthState } from '${join(projectRoot, 'lib/auth-state.ts')}';
`);
const outFile = join(dir, 'bundle.cjs');
execFileSync('npx', [
  'esbuild', entry, '--bundle', '--platform=node', '--format=cjs',
  `--alias:expo-secure-store=${join(here, 'stubs/secure-store.cjs')}`,
  `--alias:@/lib/access-token=${join(here, 'stubs/access-token.cjs')}`,
  `--alias:@/lib/api=${join(here, 'stubs/kyc-api.cjs')}`,
  `--alias:@/lib=${join(projectRoot, 'lib')}`,
  `--outfile=${outFile}`,
], { cwd: projectRoot, stdio: 'pipe' });

const req = createRequire(import.meta.url);
const { resolvePostAuthRoute, checkDriverKyc, clearStoredAuthState, knownDriverKyc, emitKycRequired, onKycRequired, kycLockTarget, kycLockCovers, noteDriverKyc, onDriverKycChange } = req(outFile);
const kyc = req(join(here, 'stubs/kyc-api.cjs')).__kyc;
const store = req(join(here, 'stubs/secure-store.cjs')).__store;

const driver = { role: 'DRIVER', onboardingComplete: true, onboardingRoute: '/driver/(tabs)/home' };
const rider = { role: 'RIDER', onboardingComplete: true, onboardingRoute: '/rider' };
const offline = new Error('Network request failed');

test.beforeEach(async () => { await clearStoredAuthState(); store.clear(); kyc.answer = null; kyc.calls = 0; });

test('a driver who only signed up (KYC not started) goes to verification, never the dashboard', async () => {
  kyc.answer = 'PENDING';
  assert.equal(await resolvePostAuthRoute(driver, 'token'), '/driver/onboarding/welcome');
});

test('a rejected driver lands on what to fix, not back at the start', async () => {
  kyc.answer = 'REJECTED';
  assert.equal(await resolvePostAuthRoute(driver, 'token'), '/driver/onboarding/pending');
});

test('a driver in review waits on the pending screen; an approved one gets the dashboard', async () => {
  kyc.answer = 'SUBMITTED';
  assert.equal(await resolvePostAuthRoute(driver, 'token'), '/driver/onboarding/pending');
  kyc.answer = 'APPROVED';
  assert.equal(await resolvePostAuthRoute(driver, 'token'), '/driver/(tabs)/home');
});

test('with no signal, the last answer from the server decides; never known means verification', async () => {
  kyc.answer = offline;
  assert.equal(await resolvePostAuthRoute(driver, 'token'), '/driver/onboarding/welcome', 'nothing known: not the dashboard');
  kyc.answer = 'APPROVED';
  await checkDriverKyc('token');
  kyc.answer = offline;
  assert.equal(await resolvePostAuthRoute(driver, 'token'), '/driver/(tabs)/home', 'approved before: not locked out');
});

test('signing out forgets it, so the next driver on this phone is checked afresh', async () => {
  kyc.answer = 'APPROVED';
  await checkDriverKyc('token');
  assert.equal(knownDriverKyc(), 'APPROVED');
  await clearStoredAuthState();
  assert.equal(knownDriverKyc(), null);
  kyc.answer = offline;
  assert.equal(await resolvePostAuthRoute(driver, 'token'), '/driver/onboarding/welcome');
});

test('the server refusing a driver for KYC tells the dashboard at once', async () => {
  kyc.answer = 'APPROVED';
  await checkDriverKyc('token');
  let told = 0;
  const off = onKycRequired(() => { told += 1; });
  emitKycRequired();
  off();
  assert.equal(told, 1);
  assert.equal(knownDriverKyc(), null, 'no longer taken as approved');
});

test('riders are not asked about KYC', async () => {
  kyc.answer = 'PENDING';
  assert.equal(await resolvePostAuthRoute(rider, 'token'), '/rider');
  assert.equal(kyc.calls, 0);
});

const at = (path) => path.split('/');

test('the lock: an unverified driver is forced back to verification from every driver screen', () => {
  for (const status of ['PENDING', 'REJECTED', null]) {
    const verification = status === 'REJECTED' ? '/driver/onboarding/pending' : '/driver/onboarding/welcome';
    for (const screen of ['driver/(tabs)/home', 'driver/(tabs)/wallet', 'driver/withdraw', 'driver/stellar', 'driver/navigation', 'driver/(tabs)/interstate']) {
      assert.equal(kycLockTarget(status, at(screen)), verification, `${status} on ${screen}`);
      assert.equal(kycLockCovers(status, at(screen)), true, 'hidden while moved');
    }
    for (const step of ['welcome', 'nin-upload', 'licence-upload', 'face-verification', 'vehicle-info', 'vehicle-photos']) {
      assert.equal(kycLockTarget(status, at(`driver/onboarding/${step}`)), null, `${status} may do ${step}`);
      assert.equal(kycLockCovers(status, at(`driver/onboarding/${step}`)), false);
    }
  }
});

test('the lock: documents in, the driver waits on "Under review" and cannot go anywhere else', () => {
  for (const screen of ['driver/(tabs)/home', 'driver/onboarding/welcome', 'driver/onboarding/nin-upload', 'driver/onboarding/vehicle-photos']) {
    assert.equal(kycLockTarget('SUBMITTED', at(screen)), '/driver/onboarding/pending', screen);
  }
  assert.equal(kycLockTarget('SUBMITTED', at('driver/onboarding/pending')), null, 'stays there');
});

test('the lock: an approved driver goes anywhere; before the answer the dashboard stays hidden', () => {
  assert.equal(kycLockTarget('APPROVED', at('driver/(tabs)/home')), null);
  assert.equal(kycLockCovers('APPROVED', at('driver/(tabs)/home')), false);
  assert.equal(kycLockTarget(undefined, at('driver/(tabs)/home')), null, 'no move until the server answers');
  assert.equal(kycLockCovers(undefined, at('driver/(tabs)/home')), true, 'but nothing shows either');
});

test('approval seen by the pending screen reaches the lock', () => {
  const seen = [];
  const off = onDriverKycChange((status) => seen.push(status));
  noteDriverKyc('APPROVED');
  off();
  assert.deepEqual(seen, ['APPROVED']);
  assert.equal(knownDriverKyc(), 'APPROVED');
});
