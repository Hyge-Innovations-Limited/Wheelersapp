/**
 * Reconnecting after a drop: the wait doubles up to 30 seconds, every wait is
 * scattered, and only a connection that lasted puts the phone back on the
 * first step. This is what keeps ten thousand phones from hitting a restarting
 * server in the same second.
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
const outFile = join(mkdtempSync(join(tmpdir(), 'wheelers-backoff-')), 'backoff.cjs');
execFileSync('npx', ['esbuild', join(projectRoot, 'lib/reconnect-backoff.ts'), '--bundle', '--platform=node', '--format=cjs', `--outfile=${outFile}`], { cwd: projectRoot, stdio: 'pipe' });
const { reconnectStepMs, reconnectDelayMs, createReconnectBackoff, RECONNECT_STABLE_MS } = createRequire(import.meta.url)(outFile);

test('the step doubles from 1 second and stops at 30', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 50].map(reconnectStepMs), [1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
  assert.equal(reconnectStepMs(-3), 1000);
  assert.equal(reconnectStepMs(Number.NaN), 1000);
});

test('every wait lands between half of the step and the whole step', () => {
  assert.equal(reconnectDelayMs(2, () => 0), 2000);
  assert.equal(reconnectDelayMs(2, () => 1), 4000);
  assert.equal(reconnectDelayMs(2, () => 0.5), 3000);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    for (let i = 0; i < 200; i += 1) {
      const delay = reconnectDelayMs(attempt);
      const step = reconnectStepMs(attempt);
      assert.ok(delay >= step / 2 && delay <= step, `attempt ${attempt}: ${delay}`);
    }
  }
});

test('ten thousand phones that dropped together do not come back together', () => {
  const buckets = new Map();
  for (let i = 0; i < 10_000; i += 1) {
    const second = Math.floor(reconnectDelayMs(4) / 1000);
    buckets.set(second, (buckets.get(second) ?? 0) + 1);
  }
  assert.ok(buckets.size >= 8, `spread over ${buckets.size} different seconds`);
  assert.ok(Math.max(...buckets.values()) < 2_000, 'no single second takes more than a fifth of them');
});

test('failures climb; a connection that lasted resets them; one that did not, does not', () => {
  let clock = 0;
  const backoff = createReconnectBackoff(() => 1, () => clock);
  assert.deepEqual([backoff.nextDelayMs(), backoff.nextDelayMs(), backoff.nextDelayMs()], [1000, 2000, 4000]);

  // The server accepts, then drops the socket a second later: still failing.
  backoff.opened();
  clock += 1_000;
  assert.equal(backoff.nextDelayMs(), 8000);

  // A connection that stayed up: the next drop starts from the first step.
  backoff.opened();
  clock += RECONNECT_STABLE_MS;
  assert.equal(backoff.nextDelayMs(), 1000);
  assert.equal(backoff.nextDelayMs(), 2000);

  // Going online on purpose starts fresh.
  backoff.reset();
  assert.equal(backoff.nextDelayMs(), 1000);
});
