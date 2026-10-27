/**
 * Auto-accept on a search: the server's answers to the switch, the switch
 * turned off by the server when the wallet no longer covers a raised price,
 * and nothing at all from servers that do not know it.
 *
 *   node --test __tests__/auto-accept.test.mjs
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
const outFile = join(mkdtempSync(join(tmpdir(), 'wheelers-auto-accept-')), 'bundle.cjs');
execFileSync('npx', ['esbuild', join(projectRoot, 'lib/auto-accept.ts'), '--bundle', '--platform=node', '--format=cjs', `--outfile=${outFile}`], { cwd: projectRoot, stdio: 'pipe' });
const { applyAutoAcceptReply, autoAcceptFromPayload } = createRequire(import.meta.url)(outFile);

const ride = { rideId: 'ride-1', status: 'bidding' };

test('done: on or off as the server says, and the switch is known', () => {
  const on = applyAutoAcceptReply(ride, 'ride:auto_accept:done', { rideId: 'ride-1', on: true });
  assert.equal(on.answered, true);
  assert.equal(on.ride.autoAccept, true);
  assert.equal(on.ride.autoAcceptSupported, true);
  assert.equal(on.error, null);
  const off = applyAutoAcceptReply(on.ride, 'ride:auto_accept:done', { rideId: 'ride-1', on: false });
  assert.equal(off.ride.autoAccept, false);
  assert.equal(off.error, null, 'the rider switched it off: nothing to say');
});

test('switched off by the server after a raise the wallet cannot cover: the rider is told', () => {
  const r = applyAutoAcceptReply({ ...ride, autoAccept: true }, 'ride:auto_accept:done', { rideId: 'ride-1', on: false, reason: 'insufficient_funds' });
  assert.equal(r.ride.autoAccept, false);
  assert.match(r.error, /short/);
});

test('off because it booked a driver: no message', () => {
  const r = applyAutoAcceptReply({ ...ride, autoAccept: true }, 'ride:auto_accept:done', { rideId: 'ride-1', on: false, reason: 'booked' });
  assert.equal(r.ride.autoAccept, false);
  assert.equal(r.error, null);
});

test('rejected: off, with the server\'s words', () => {
  const r = applyAutoAcceptReply(ride, 'ride:auto_accept:rejected', { rideId: 'ride-1', reason: 'insufficient_funds', message: 'Add ₦800 to use auto-accept.' });
  assert.equal(r.ride.autoAccept, false);
  assert.equal(r.error, 'Add ₦800 to use auto-accept.');
  const ended = applyAutoAcceptReply(ride, 'ride:auto_accept:rejected', { rideId: 'ride-1', reason: 'not_searching' });
  assert.equal(ended.error, 'This search has ended.');
});

test('another ride, or no ride: untouched and not an answer', () => {
  const r = applyAutoAcceptReply(ride, 'ride:auto_accept:done', { rideId: 'ride-2', on: true });
  assert.equal(r.ride, ride);
  assert.equal(r.answered, false);
  assert.equal(applyAutoAcceptReply(null, 'ride:auto_accept:done', { rideId: 'ride-1', on: true }).ride, null);
});

test('a search payload with autoAccept shows the switch; one without leaves the ride alone', () => {
  assert.deepEqual(autoAcceptFromPayload(ride, { autoAccept: true }), { ...ride, autoAccept: true, autoAcceptSupported: true });
  assert.equal(autoAcceptFromPayload(ride, {}), ride);
  assert.equal(autoAcceptFromPayload(ride, { autoAccept: 'yes' }), ride);
});
