/**
 * Trip recording uploads: a segment waits on the phone until the server has
 * it, retries back off to an hour, a refusal the server would repeat is
 * dropped, and nothing is kept past 30 days.
 *
 *   node --test __tests__/recording-uploads.test.mjs
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
const outFile = join(mkdtempSync(join(tmpdir(), 'wheelers-uploads-')), 'uploads.cjs');
execFileSync('npx', ['esbuild', join(projectRoot, 'lib/recording-uploads.ts'), '--bundle', '--platform=node', '--format=cjs', `--outfile=${outFile}`], { cwd: projectRoot, stdio: 'pipe' });
const { drainUploads, enqueueSegment, nextRetryMs, RECORDING_KEEP_MS } = createRequire(import.meta.url)(outFile);

const NOW = 1_800_000_000_000;
const segment = (over = {}) => ({ rideId: 'ride-1', segmentIndex: 0, uri: 'file:///seg-0.m4a', durationSec: 300, createdAt: NOW, ...over });

function effects(queue, over = {}) {
  const state = { queue, deleted: [], puts: [], completed: [] };
  return {
    state,
    load: async () => state.queue,
    update: async (change) => { state.queue = change(state.queue); },
    fileSize: async () => 1000,
    deleteFile: async (uri) => { state.deleted.push(uri); },
    uploadUrl: async (rideId, index) => `https://r2.invalid/${rideId}/${index}`,
    put: async (url) => { state.puts.push(url); },
    complete: async (rideId, index) => { state.completed.push(`${rideId}:${index}`); },
    now: () => NOW,
    ...over,
  };
}

test('a finished segment is uploaded, confirmed, then deleted from the phone', async () => {
  const fx = effects(enqueueSegment([], segment(), NOW));
  assert.equal(await drainUploads(fx), 1);
  assert.deepEqual(fx.state.puts, ['https://r2.invalid/ride-1/0']);
  assert.deepEqual(fx.state.completed, ['ride-1:0']);
  assert.deepEqual(fx.state.deleted, ['file:///seg-0.m4a']);
  assert.deepEqual(fx.state.queue, []);
});

test('the same segment queued twice is kept once', () => {
  const once = enqueueSegment([], segment(), NOW);
  assert.equal(enqueueSegment(once, segment({ uri: 'file:///other.m4a' }), NOW).length, 1);
});

test('no signal: the segment stays, and waits longer each time, up to an hour', async () => {
  const fx = effects(enqueueSegment([], segment(), NOW), { put: async () => { throw new Error('Network request failed'); } });
  assert.equal(await drainUploads(fx), 0);
  assert.equal(fx.state.queue.length, 1);
  assert.equal(fx.state.queue[0].attempts, 1);
  assert.equal(fx.state.queue[0].nextAt, NOW + 60_000);
  assert.deepEqual(fx.state.deleted, []);
  // Not due yet: the next run leaves it alone.
  assert.equal(await drainUploads({ ...fx, put: async () => assert.fail('retried too early') }), 0);
  assert.deepEqual([1, 2, 3, 7, 8, 20].map(nextRetryMs), [60_000, 120_000, 240_000, 3_600_000, 3_600_000, 3_600_000]);
});

test('a refusal the server would repeat (not mine, too old, too big) drops the segment', async () => {
  for (const status of [403, 404, 409, 413]) {
    const fx = effects(enqueueSegment([], segment(), NOW), { uploadUrl: async () => { throw Object.assign(new Error('no'), { status }); } });
    await drainUploads(fx);
    assert.deepEqual(fx.state.queue, [], `status ${status}`);
    assert.deepEqual(fx.state.deleted, ['file:///seg-0.m4a'], `status ${status}`);
  }
});

test('a server error or signed-out is retried, not dropped', async () => {
  for (const status of [401, 500, 503]) {
    const fx = effects(enqueueSegment([], segment(), NOW), { complete: async () => { throw Object.assign(new Error('no'), { status }); } });
    await drainUploads(fx);
    assert.equal(fx.state.queue.length, 1, `status ${status}`);
    assert.deepEqual(fx.state.deleted, [], `status ${status}`);
  }
});

test('a segment older than 30 days is deleted unsent; a missing file is forgotten', async () => {
  const old = segment({ segmentIndex: 1, uri: 'file:///old.m4a', createdAt: NOW - RECORDING_KEEP_MS - 1 });
  const gone = segment({ segmentIndex: 2, uri: 'file:///gone.m4a' });
  const fx = effects([...enqueueSegment([], old, NOW), ...enqueueSegment([], gone, NOW)], { fileSize: async () => null });
  assert.equal(await drainUploads(fx), 0);
  assert.deepEqual(fx.state.queue, []);
  assert.deepEqual(fx.state.deleted, ['file:///old.m4a']);
  assert.deepEqual(fx.state.puts, []);
});

test('a piece finished while an upload run is going is kept', async () => {
  const fx = effects(enqueueSegment([], segment(), NOW));
  const late = segment({ segmentIndex: 1, uri: 'file:///seg-1.m4a' });
  fx.put = async (url) => {
    fx.state.puts.push(url);
    fx.state.queue = enqueueSegment(fx.state.queue, late, NOW);
  };
  assert.equal(await drainUploads(fx), 1);
  assert.deepEqual(fx.state.queue.map((item) => item.segmentIndex), [1]);
});
