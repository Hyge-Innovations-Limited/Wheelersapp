/**
 * The same JavaScript reaches builds with and without Live call's native
 * code. On a build without it, WebRTC must never be loaded (loading it
 * throws), and the app must simply have no Call button.
 *
 *   node --test __tests__/live-call-native.test.mjs
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

function build(name) {
  const outFile = join(mkdtempSync(join(tmpdir(), `wheelers-live-call-${name}-`)), 'native.cjs');
  execFileSync('npx', [
    'esbuild', join(projectRoot, 'lib/live-call/native.ts'),
    '--bundle', '--platform=node', '--format=cjs',
    `--alias:react-native=${join(here, 'stubs/react-native-native-modules.cjs')}`,
    `--alias:react-native-webrtc=${join(here, 'stubs/webrtc-throws.cjs')}`,
    `--alias:react-native-incall-manager=${join(here, 'stubs/webrtc-throws.cjs')}`,
    `--outfile=${outFile}`,
  ], { cwd: projectRoot, stdio: 'pipe' });
  return outFile;
}

test('a build without the native code: no calls, and WebRTC is never even loaded', () => {
  globalThis.__WHEELERS_TEST_WEBRTC_LOADS__ = 0;
  for (const key of Object.keys(globalThis.__WHEELERS_TEST_NATIVE_MODULES__ ?? {})) delete globalThis.__WHEELERS_TEST_NATIVE_MODULES__[key];
  const native = req(build('old'));
  assert.equal(native.liveCallSupported, false);
  assert.equal(native.webrtc(), null);
  assert.equal(native.inCallManager(), null);
  assert.equal(globalThis.__WHEELERS_TEST_WEBRTC_LOADS__, 0, 'nothing tried to load it');
});

test('a build with the native code, where loading still fails: calls are off, nothing crashes', () => {
  globalThis.__WHEELERS_TEST_WEBRTC_LOADS__ = 0;
  globalThis.__WHEELERS_TEST_NATIVE_MODULES__ = Object.assign(globalThis.__WHEELERS_TEST_NATIVE_MODULES__ ?? {}, { WebRTCModule: {}, InCallManager: {} });
  const native = req(build('new'));
  assert.equal(native.liveCallSupported, true);
  assert.equal(native.webrtc(), null, 'the throw is caught');
  assert.equal(native.inCallManager(), null);
  assert.equal(globalThis.__WHEELERS_TEST_WEBRTC_LOADS__, 2, 'each tried once');
  native.webrtc();
  assert.equal(globalThis.__WHEELERS_TEST_WEBRTC_LOADS__, 2, 'and not again');
});
