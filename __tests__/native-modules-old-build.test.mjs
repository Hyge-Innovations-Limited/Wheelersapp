/**
 * An update sent over the air reaches builds made before Face ID and
 * passkeys existed. There, loading their packages after start-up is a crash
 * the code cannot catch (React Native reports it as fatal): on 17 Oct an
 * update did exactly that and closed the app on every phone. So the native
 * part is asked for first, and the package is never loaded without it.
 *
 *   node --test __tests__/native-modules-old-build.test.mjs
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
  const outFile = join(mkdtempSync(join(tmpdir(), 'wheelers-old-build-')), 'out.cjs');
  execFileSync('npx', [
    'esbuild', join(projectRoot, file),
    '--bundle', '--platform=node', '--format=cjs',
    `--alias:expo=${join(here, 'stubs/expo-optional-modules.cjs')}`,
    `--alias:expo-secure-store=${join(here, 'stubs/secure-store.cjs')}`,
    `--alias:react-native=${join(here, 'stubs/react-native-platform.cjs')}`,
    `--alias:expo-local-authentication=${join(here, 'stubs/native-package-throws.cjs')}`,
    `--alias:expo-av=${join(here, 'stubs/native-package-throws.cjs')}`,
    `--alias:@/assets/sounds/ride-request.wav=${join(here, 'stubs/native-package-throws.cjs')}`,
    `--alias:react-native-passkeys=${join(here, 'stubs/native-package-throws.cjs')}`,
    `--outfile=${outFile}`,
  ], { cwd: projectRoot, stdio: 'pipe' });
  return outFile;
}

test('Face ID on a build without it: not available, and its package is never loaded', async () => {
  globalThis.__WHEELERS_TEST_NATIVE_LOADS__ = 0;
  const biometrics = req(build('lib/biometrics.ts'));
  assert.equal(await biometrics.biometricKind(), null);
  assert.equal(await biometrics.confirmOwner('Unlock'), false);
  assert.equal(globalThis.__WHEELERS_TEST_NATIVE_LOADS__, 0);
});

test('passkeys on a build without them: not available, and their package is never loaded', () => {
  globalThis.__WHEELERS_TEST_NATIVE_LOADS__ = 0;
  const passkeys = req(build('lib/passkeys.ts'));
  assert.equal(passkeys.passkeysAvailable(), false);
  assert.equal(globalThis.__WHEELERS_TEST_NATIVE_LOADS__, 0);
});

test('sounds on a build without expo-av: silent, and its package is never loaded', async () => {
  globalThis.__WHEELERS_TEST_NATIVE_LOADS__ = 0;
  const sounds = req(build('lib/sounds.ts'));
  await sounds.playBidAlertChime();
  await sounds.playRideRequestSound();
  assert.equal(globalThis.__WHEELERS_TEST_NATIVE_LOADS__, 0);
});

test('sounds on a build with expo-av: its package is loaded once', () => {
  globalThis.__WHEELERS_TEST_NATIVE_LOADS__ = 0;
  globalThis.__WHEELERS_TEST_EXPO_MODULES__ = { ExponentAV: {} };
  try {
    req(build('lib/sounds.ts'));
  } finally {
    globalThis.__WHEELERS_TEST_EXPO_MODULES__ = {};
  }
  assert.equal(globalThis.__WHEELERS_TEST_NATIVE_LOADS__, 1);
});
