/**
 * The offers back on screen after an accept did not go through: not the list
 * as it was at Accept (old prices, drivers who left since), but that list with
 * every offer received since folded in, newest price per driver; and the
 * server's list as truth after 'offer_changed'.
 *
 *   node --test __tests__/refused-accept-offers.test.mjs
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
const outFile = join(mkdtempSync(join(tmpdir(), 'wheelers-refused-')), 'bundle.cjs');
execFileSync('npx', ['esbuild', join(projectRoot, 'lib/ride-offers.ts'), '--bundle', '--platform=node', '--format=cjs', `--outfile=${outFile}`], { cwd: projectRoot, stdio: 'pipe' });
const { offersAfterRefusedAccept, withOfferPrice, offersFromServer, stillOpenForChosen, dismissOffer } = createRequire(import.meta.url)(outFile);

const bid = (driverId, counterOfferNgn, extra = {}) => ({
  driverId, driverUserId: `u-${driverId}`, counterOfferNgn, driverName: driverId, driverRating: 4.8,
  vehiclePlate: 'ABC', vehicleModel: 'Corolla', etaSeconds: 300, receivedAt: '2026-10-27T10:00:00Z', ...extra,
});
const ids = (offers) => offers.map((o) => `${o.driverId}:${o.counterOfferNgn}`);

test('a re-bid received while confirming wins over the price at Accept', () => {
  const held = [bid('a', 3000), bid('b', 3200)];
  const since = [bid('b', 3400), bid('c', 2900)];
  assert.deepEqual(ids(offersAfterRefusedAccept(held, since)), ['c:2900', 'a:3000', 'b:3400']);
});

test('a driver who withdrew while confirming does not come back', () => {
  // ride:driver_rejected takes them off the held list too (the session does this with dismissOffer).
  const held = dismissOffer([bid('a', 3000), bid('b', 3200)], 'b');
  assert.deepEqual(ids(offersAfterRefusedAccept(held, [])), ['a:3000']);
});

test('the driver who is gone leaves; with nothing kept, only what came since', () => {
  assert.deepEqual(ids(offersAfterRefusedAccept([bid('a', 3000), bid('b', 3200)], [], 'a')), ['b:3200']);
  assert.deepEqual(ids(offersAfterRefusedAccept(null, [bid('c', 2500)])), ['c:2500']);
});

test('offer_changed with the price now: the card shows it', () => {
  const offers = [bid('a', 3000), bid('b', 3200)];
  assert.deepEqual(ids(withOfferPrice(offers, 'a', 3400)), ['b:3200', 'a:3400']);
  assert.equal(withOfferPrice(offers, 'a', undefined), offers);
  assert.equal(withOfferPrice(offers, 'z', 3400), offers);
});

test('the server\'s list is truth: its prices, nobody who left; a pending counter stays while the price has not moved', () => {
  const onScreen = [bid('a', 3000, { riderCounterNgn: 2800 }), bid('b', 3200, { riderCounterNgn: 3000 }), bid('gone', 2000)];
  const server = [bid('b', 3500), bid('a', 3000)];
  const next = offersFromServer(onScreen, server);
  assert.deepEqual(ids(next), ['a:3000', 'b:3500']);
  assert.equal(next[0].riderCounterNgn, 2800);
  assert.equal(next[1].riderCounterNgn, undefined, 'the driver moved: the old counter goes');
});

test('Confirming waits only while the chosen offer is still open on a search', () => {
  assert.equal(stillOpenForChosen({ status: 'bidding', offers: [bid('a', 3000)] }, 'a'), true);
  assert.equal(stillOpenForChosen({ status: 'bidding', offers: [bid('b', 3000)] }, 'a'), false);
  assert.equal(stillOpenForChosen({ status: 'matched', offers: [] }, 'a'), false);
  assert.equal(stillOpenForChosen(null, 'a'), false);
});
