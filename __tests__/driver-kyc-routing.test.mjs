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
const { resolvePostAuthRoute, checkDriverKyc, clearStoredAuthState, knownDriverKyc, emitKycRequired, onKycRequired } = req(outFile);
const kyc = req(join(here, 'stubs/kyc-api.cjs')).__kyc;
const store = req(join(here, 'stubs/secure-store.cjs')).__store;

const driver = { role: 'DRIVER', onboardingComplete: true, onboardingRoute: '/driver/(tabs)/home' };
const rider = { role: 'RIDER', onboardingComplete: true, onboardingRoute: '/rider' };
const offline = new Error('Network request failed');

test.beforeEach(async () => { await clearStoredAuthState(); store.clear(); kyc.answer = null; kyc.calls = 0; });

test('a driver who only signed up (KYC not started) goes to verification, never the dashboard', async () => {
  kyc.answer = 'PENDING';
  assert.equal(await resolvePostAuthRoute(driver, 'token'), '/driver/onboarding/welcome');
  kyc.answer = 'REJECTED';
  assert.equal(await resolvePostAuthRoute(driver, 'token'), '/driver/onboarding/welcome');
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
