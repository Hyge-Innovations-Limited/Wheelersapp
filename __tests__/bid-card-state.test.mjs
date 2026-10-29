/**
 * A driver's bid card: white while waiting, blue while the rider pays,
 * green when accepted, red when the rider declined every offer. No "Change
 * bid" once the driver took the rider's own price.
 *
 *   node --test __tests__/bid-card-state.test.mjs
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
const dir = mkdtempSync(join(tmpdir(), 'wheelers-bid-card-'));
const entry = join(dir, 'entry.ts');
writeFileSync(entry, `
export * from '${join(projectRoot, 'lib/driver-session-reducer.ts')}';
export * from '${join(projectRoot, 'lib/bid-card-state.ts')}';
`);
const outFile = join(dir, 'bundle.cjs');
execFileSync('npx', ['esbuild', entry, '--bundle', '--platform=node', '--format=cjs', `--outfile=${outFile}`], { cwd: projectRoot, stdio: 'pipe' });
const { reduceDriverSession, recordBid, defaultDriverSession, bidStage, tookRidersPrice, hydrateBidRecords, repricedAfterDecline } = createRequire(import.meta.url)(outFile);

const NOW = Date.parse('2026-10-01T10:00:00Z');
const offer = (riderOfferNgn = 3000) => ({
  rideId: 'ride-1', riderId: 'rider-1',
  pickup: { lat: 6.5, lng: 3.3, address: 'Akoka' }, destination: { lat: 6.4, lng: 3.4, address: 'Yaba' }, stops: [],
  fareEstimateNgn: 3000, riderOfferNgn, expiresAt: new Date(NOW + 60_000).toISOString(), receivedAtMs: NOW,
});
const withBid = (amount, riderOfferNgn = 3000) => recordBid({ ...defaultDriverSession }, offer(riderOfferNgn), amount, new Date(NOW).toISOString());
const stageOf = (s) => bidStage(s.pendingBids['ride-1']);

test('waiting, then paying, then accepted', () => {
  let s = withBid(3500);
  assert.equal(stageOf(s), 'waiting');
  s = reduceDriverSession(s, 'ride:rider_paying', { rideId: 'ride-1' }, NOW);
  assert.equal(stageOf(s), 'paying');
  s = reduceDriverSession(s, 'ride:offer_accepted', { rideId: 'ride-1', agreedFareNgn: 3500, paymentMethod: 'WALLET' }, NOW);
  assert.equal(stageOf(s), 'accepted');
  assert.equal(reduceDriverSession(s, 'ride:bid_declined', { rideId: 'ride-1' }, NOW), s, 'an accepted bid is never turned red');
});

test('the rider declined every offer: red, "declined"', () => {
  const s = reduceDriverSession(withBid(3500), 'ride:bid_declined', { rideId: 'ride-1' }, NOW);
  assert.equal(stageOf(s), 'declined');
});

test('another driver won: grey "taken"; a bid that is not ours is left alone', () => {
  const s = reduceDriverSession(withBid(3500), 'ride:bid_lost', { rideId: 'ride-1' }, NOW);
  assert.equal(stageOf(s), 'lost');
  const other = withBid(3500);
  assert.equal(reduceDriverSession(other, 'ride:bid_declined', { rideId: 'ride-2' }, NOW), other);
});

test('took the rider\'s own price: no Change bid; a counter-bid keeps it', () => {
  assert.equal(tookRidersPrice(withBid(3000).pendingBids['ride-1']), true);
  assert.equal(tookRidersPrice(withBid(3500).pendingBids['ride-1']), false);
});

test('the server saying DECLINED rebuilds a red card', () => {
  const s = hydrateBidRecords(withBid(3500), [{
    rideId: 'ride-1', riderId: 'rider-1', status: 'DECLINED', amountNgn: 3500, createdAt: new Date(NOW).toISOString(), resolvedAt: new Date(NOW).toISOString(),
    ride: { pickupAddress: 'Akoka', destAddress: 'Yaba', fareEstimateNgn: 3000, riderOfferNgn: 3000, agreedFareNgn: null },
  }], NOW);
  assert.equal(stageOf(s), 'declined');
});

test('declined stays a live card: the rider\'s next price lands on it (still red, not on Home), and a new bid makes it white again', () => {
  const declined = reduceDriverSession(withBid(4400, 4200), 'ride:bid_declined', { rideId: 'ride-1' }, NOW);
  assert.equal(stageOf(declined), 'declined');
  assert.equal(declined.pendingBids['ride-1'].outcome, undefined, 'not an end');

  const resent = reduceDriverSession(declined, 'ride:offer', offer(4600), NOW + 5_000);
  assert.equal(stageOf(resent), 'declined', 'still red');
  assert.equal(resent.pendingBids['ride-1'].offer.riderOfferNgn, 4600, 'with the rider\'s new price');
  assert.equal(resent.offers.length, 0, 'not queued on Home as a new request');

  const rebid = recordBid(resent, resent.pendingBids['ride-1'].offer, 4600, new Date(NOW + 9_000).toISOString());
  assert.equal(stageOf(rebid), 'waiting', 'a new bid is live again');
});

test('the server says DECLINED for a card still waiting here: it turns red, and stays a live card', () => {
  const s = hydrateBidRecords(withBid(3500), [{
    rideId: 'ride-1', riderId: 'rider-1', status: 'DECLINED', amountNgn: 3500, createdAt: new Date(NOW).toISOString(), resolvedAt: new Date(NOW).toISOString(),
    ride: { pickupAddress: 'Akoka', destAddress: 'Yaba', fareEstimateNgn: 3000, riderOfferNgn: 3000, agreedFareNgn: null },
  }], NOW);
  assert.equal(stageOf(s), 'declined');
  assert.equal(s.pendingBids['ride-1'].outcome, undefined);
});

test('the trip was cancelled: the server row (CANCELLED) removes the card — no green "Starting your trip…" coming back', () => {
  const accepted = reduceDriverSession(withBid(2800, 2500), 'ride:offer_accepted', { rideId: 'ride-1', agreedFareNgn: 2800, paymentMethod: 'WALLET' }, NOW);
  assert.equal(stageOf(accepted), 'accepted');
  const rec = (status) => [{
    rideId: 'ride-1', riderId: 'rider-1', status, amountNgn: 2800, createdAt: new Date(NOW).toISOString(), resolvedAt: new Date(NOW).toISOString(),
    ride: { pickupAddress: 'Akoka', destAddress: 'Yaba', fareEstimateNgn: 2500, riderOfferNgn: 2500, agreedFareNgn: 2800 },
  }];
  const synced = hydrateBidRecords(accepted, rec('CANCELLED'), NOW);
  assert.equal(synced.pendingBids['ride-1'], undefined, 'the card is gone');
  const fresh = hydrateBidRecords({ ...defaultDriverSession }, rec('CANCELLED'), NOW);
  assert.equal(fresh.pendingBids['ride-1'], undefined, 'and is never rebuilt');
});

test('the trip is over: the "Accepted · Starting your trip…" card goes, and the sync never brings it back', () => {
  const accepted = reduceDriverSession(withBid(12500, 11900), 'ride:offer_accepted', { rideId: 'ride-1', agreedFareNgn: 12500, paymentMethod: 'WALLET' }, NOW);
  const done = reduceDriverSession(accepted, 'ride:completed', { rideId: 'ride-1', fareNgn: 12500 }, NOW);
  assert.equal(done.pendingBids['ride-1'], undefined, 'gone on completion');

  const rec = [{
    rideId: 'ride-1', riderId: 'rider-1', status: 'ACCEPTED', amountNgn: 12500, createdAt: new Date(NOW).toISOString(), resolvedAt: new Date(NOW).toISOString(),
    ride: { status: 'COMPLETED', pickupAddress: 'Ilemere', destAddress: 'Unilag', fareEstimateNgn: 11900, riderOfferNgn: 11900, agreedFareNgn: 12500 },
  }];
  assert.equal(hydrateBidRecords({ ...defaultDriverSession }, rec, NOW).pendingBids['ride-1'], undefined, 'not rebuilt from the server');
  assert.equal(hydrateBidRecords(accepted, rec, NOW).pendingBids['ride-1'], undefined, 'and a stale local one is removed');
});

test('declined, then the rider names a new price: live again ("New price"), red only until then and again if they decline once more', () => {
  const payload = (riderOfferNgn) => ({ ...offer(riderOfferNgn), expiresAt: new Date(NOW + 600_000).toISOString() });
  let s = reduceDriverSession(withBid(3500), 'ride:bid_declined', { rideId: 'ride-1' }, NOW);
  assert.equal(repricedAfterDecline(s.pendingBids['ride-1']), false, 'declined, nothing new: red');

  // The same price sent again is not a new price.
  s = reduceDriverSession(s, 'ride:offer', payload(3000), NOW + 30_000);
  assert.equal(repricedAfterDecline(s.pendingBids['ride-1']), false);

  s = reduceDriverSession(s, 'ride:offer', payload(3300), NOW + 60_000);
  const bid = s.pendingBids['ride-1'];
  assert.equal(bid.offer.riderOfferNgn, 3300, 'the card shows the new price');
  assert.equal(stageOf(s), 'declined', 'the bid form stays: the driver still has to answer');
  assert.equal(repricedAfterDecline(bid), true, 'but it is shown live, not red');

  s = reduceDriverSession(s, 'ride:bid_declined', { rideId: 'ride-1' }, NOW + 120_000);
  assert.equal(repricedAfterDecline(s.pendingBids['ride-1']), false, 'declined again: red again');
});

// ---- "Rider accepted · paying now" (blue) ----
const { pruneExpiredBids, PAYING_LABEL } = (() => ({ ...createRequire(import.meta.url)(outFile) }))();
const SINCE = new Date(NOW).toISOString();
const UNTIL = new Date(NOW + 120_000).toISOString();
const paying = (s, at = NOW, extra = { payingSince: SINCE, payingUntil: UNTIL }) =>
  reduceDriverSession(s, 'ride:rider_paying', { rideId: 'ride-1', ...extra }, at);
const ended = (s, reason, at = NOW + 1000) => reduceDriverSession(s, 'ride:rider_paying_ended', { rideId: 'ride-1', reason }, at);
const counteredBid = () => {
  const s = withBid(3500, 3000);
  const b = s.pendingBids['ride-1'];
  return { ...s, pendingBids: { 'ride-1': { ...b, counteredAt: new Date(NOW).toISOString(), offer: { ...b.offer, riderOfferNgn: 4000 } } } };
};

test('paying label is the blue line', () => {
  assert.equal(PAYING_LABEL, 'Rider accepted · paying now');
});

for (const [name, start] of [['waiting', () => withBid(3500)], ['countered', counteredBid]]) {
  test(`${name} -> paying -> accepted`, () => {
    let s = paying(start());
    assert.equal(stageOf(s), 'paying');
    s = reduceDriverSession(s, 'ride:offer_accepted', { rideId: 'ride-1', agreedFareNgn: 3500, paymentMethod: 'WALLET' }, NOW + 5000);
    assert.equal(stageOf(s), 'accepted');
  });
  test(`${name} -> paying -> declined`, () => {
    const s = reduceDriverSession(paying(start()), 'ride:bid_declined', { rideId: 'ride-1' }, NOW + 2000);
    assert.equal(stageOf(s), 'declined');
    assert.equal(s.pendingBids['ride-1'].payingAt, undefined);
  });
  test(`${name} -> paying -> lost`, () => {
    assert.equal(stageOf(reduceDriverSession(paying(start()), 'ride:bid_lost', { rideId: 'ride-1' }, NOW + 2000)), 'lost');
  });
  test(`${name} -> paying -> ended returns to ${name}`, () => {
    for (const reason of ['closed', 'switched', 'failed', 'something_new']) {
      const s = ended(paying(start()), reason);
      assert.equal(stageOf(s), name, reason);
      assert.equal(s.pendingBids['ride-1'].payingForMs, undefined);
    }
  });
}

test('paying ended: other_chosen is lost, cancelled and search_ended are the finished cards the app already has', () => {
  let s = ended(paying(withBid(3500)), 'other_chosen');
  assert.equal(stageOf(s), 'lost');
  assert.equal(s.pendingBids['ride-1'].endReason, 'booked_other');
  s = ended(paying(withBid(3500)), 'cancelled');
  assert.equal(stageOf(s), 'expired');
  assert.equal(s.pendingBids['ride-1'].endReason, 'rider_cancelled');
  s = ended(paying(withBid(3500)), 'search_ended');
  assert.equal(stageOf(s), 'expired');
  assert.equal(s.pendingBids['ride-1'].endReason, 'timed_out');
});

test('paying ended never touches an accepted, finished, unknown or not-paying bid', () => {
  const accepted = reduceDriverSession(paying(withBid(3500)), 'ride:offer_accepted', { rideId: 'ride-1', agreedFareNgn: 3500 }, NOW + 2000);
  assert.equal(ended(accepted, 'closed'), accepted);
  const waiting = withBid(3500);
  assert.equal(ended(waiting, 'other_chosen'), waiting);
  assert.equal(reduceDriverSession(waiting, 'ride:rider_paying_ended', { rideId: 'nope', reason: 'closed' }, NOW), waiting);
});

test('paying -> expired: the auction clock still ends a paying card of an older server', () => {
  const s = paying(withBid(3500), NOW, {});
  const later = pruneExpiredBids(s, NOW + 6 * 3_600_000);
  assert.equal(stageOf(later), 'expired');
});

test('local expiry runs on receipt time + (payingUntil - payingSince), not the phone clock', () => {
  // The phone's clock is an hour wrong: payingUntil looks long gone, yet the card holds for its 120 s.
  const skew = 3_600_000;
  const at = NOW + skew;
  const base = withBid(3500);
  const live = { ...base, pendingBids: { 'ride-1': { ...base.pendingBids['ride-1'], sentAt: new Date(at).toISOString(), offer: { ...base.pendingBids['ride-1'].offer, expiresAt: new Date(at + 600_000).toISOString() } } } };
  const s = paying(live, at);
  assert.equal(s.pendingBids['ride-1'].payingForMs, 120_000);
  assert.equal(stageOf(pruneExpiredBids(s, at + 119_000)), 'paying');
  assert.equal(stageOf(pruneExpiredBids(s, at + 121_000)), 'waiting');
});

test('a re-sent paying with a later end keeps the start; a longer spell lasts longer', () => {
  let s = paying(withBid(3500), NOW);
  s = paying(s, NOW + 60_000, { payingSince: SINCE, payingUntil: new Date(NOW + 240_000).toISOString() });
  assert.equal(s.pendingBids['ride-1'].payingAt, new Date(NOW).toISOString());
  assert.equal(stageOf(pruneExpiredBids(s, NOW + 200_000)), 'paying');
  assert.equal(stageOf(pruneExpiredBids(s, NOW + 241_000)), 'waiting');
});

test('an older server (no payingUntil): paying stays as today, no local expiry', () => {
  const s = paying(withBid(3500), NOW, {});
  assert.equal(s.pendingBids['ride-1'].payingForMs, undefined);
  assert.equal(stageOf(pruneExpiredBids(s, NOW + 30_000)), 'paying');
});

test('rehydrate: a PENDING record with payingSince/payingUntil shows blue; not-paying stays; bad times ignored', () => {
  const rec = (extra) => ({
    rideId: 'ride-1', riderId: 'rider-1', amountNgn: 3500, status: 'PENDING', createdAt: new Date(NOW - 5000).toISOString(), resolvedAt: null,
    ride: { status: 'REQUESTED', pickupAddress: 'A', destAddress: 'B', riderOfferNgn: 3000, agreedFareNgn: null, fareEstimateNgn: 3000 },
    ...extra,
  });
  const paid = { payingSince: SINCE, payingUntil: UNTIL };
  // no local card yet
  let s = hydrateBidRecords({ ...defaultDriverSession }, [rec(paid)], NOW);
  assert.equal(stageOf(s), 'paying');
  assert.equal(s.pendingBids['ride-1'].payingForMs, 120_000);
  assert.equal(stageOf(hydrateBidRecords({ ...defaultDriverSession }, [rec({})], NOW)), 'waiting');
  assert.equal(stageOf(hydrateBidRecords({ ...defaultDriverSession }, [rec({ payingSince: UNTIL, payingUntil: SINCE })], NOW)), 'waiting');
  // a local waiting card (missed the socket)
  s = hydrateBidRecords(withBid(3500), [rec(paid)], NOW);
  assert.equal(stageOf(s), 'paying');
  // an accepted local card is not turned back
  const acc = reduceDriverSession(withBid(3500), 'ride:offer_accepted', { rideId: 'ride-1', agreedFareNgn: 3500 }, NOW);
  assert.equal(stageOf(hydrateBidRecords(acc, [rec(paid)], NOW)), 'accepted');
});

test('feed card and bid screen read the same stage and the same words', async () => {
  const { readFileSync } = await import('node:fs');
  const feed = readFileSync(join(projectRoot, 'components/driver-request-feed.tsx'), 'utf8');
  const screen = readFileSync(join(projectRoot, 'app/driver/pending-bid.tsx'), 'utf8');
  for (const src of [feed, screen]) {
    assert.match(src, /bidStage\(/);
    assert.match(src, /PAYING_LABEL/);
    assert.match(src, /theme\.colors\.blue/);
    assert.doesNotMatch(src, /Rider is paying/);
    assert.doesNotMatch(src, /theme\.colors\.warning/);
  }
});

test('ended {declined} is the red declined card', () => {
  const s = ended(paying(withBid(3500)), 'declined');
  assert.equal(stageOf(s), 'declined');
  assert.equal(s.pendingBids['ride-1'].payingAt, undefined);
});

test('payingRemainingMs: lapses at receipt + remaining on socket, re-send and hydrate; 0 is not blue', () => {
  const at = NOW + 3_600_000; // wrong phone clock on purpose
  const base = withBid(3500);
  const live = { ...base, pendingBids: { 'ride-1': { ...base.pendingBids['ride-1'], sentAt: new Date(at).toISOString(), offer: { ...base.pendingBids['ride-1'].offer, expiresAt: new Date(at + 600_000).toISOString() } } } };
  let s = paying(live, at, { payingSince: SINCE, payingUntil: UNTIL, payingRemainingMs: 30_000 });
  assert.equal(stageOf(pruneExpiredBids(s, at + 29_000)), 'paying');
  assert.equal(stageOf(pruneExpiredBids(s, at + 31_000)), 'waiting');
  s = paying(s, at + 10_000, { payingSince: SINCE, payingUntil: UNTIL, payingRemainingMs: 50_000 });
  assert.equal(stageOf(pruneExpiredBids(s, at + 59_000)), 'paying');
  assert.equal(stageOf(pruneExpiredBids(s, at + 61_000)), 'waiting');
  assert.equal(stageOf(paying(live, at, { payingSince: SINCE, payingUntil: UNTIL, payingRemainingMs: 0 })), 'waiting');
  const rec = (extra) => ({ rideId: 'ride-1', riderId: 'rider-1', amountNgn: 3500, status: 'PENDING', createdAt: new Date(NOW - 5000).toISOString(), resolvedAt: null,
    ride: { status: 'REQUESTED', pickupAddress: 'A', destAddress: 'B', riderOfferNgn: 3000, agreedFareNgn: null, fareEstimateNgn: 3000 }, ...extra });
  s = hydrateBidRecords({ ...defaultDriverSession }, [rec({ payingRemainingMs: 20_000 })], NOW);
  assert.equal(stageOf(s), 'paying');
  assert.equal(s.pendingBids['ride-1'].payingForMs, 20_000);
  assert.equal(stageOf(hydrateBidRecords({ ...defaultDriverSession }, [rec({ payingRemainingMs: 0 })], NOW)), 'waiting');
  // no remainingMs: min(until - since, until - now); until already past = no blue
  s = hydrateBidRecords({ ...defaultDriverSession }, [rec({ payingSince: SINCE, payingUntil: UNTIL })], NOW + 100_000);
  assert.equal(s.pendingBids['ride-1'].payingForMs, 20_000);
  assert.equal(stageOf(hydrateBidRecords({ ...defaultDriverSession }, [rec({ payingSince: SINCE, payingUntil: UNTIL })], NOW + 130_000)), 'waiting');
});

test('hydrate drops a stale blue when the server has no payment open (older than 10 s only)', () => {
  const rec = { rideId: 'ride-1', riderId: 'rider-1', amountNgn: 3500, status: 'PENDING', createdAt: new Date(NOW - 5000).toISOString(), resolvedAt: null,
    ride: { status: 'REQUESTED', pickupAddress: 'A', destAddress: 'B', riderOfferNgn: 3000, agreedFareNgn: null, fareEstimateNgn: 3000 } };
  const s = paying(withBid(3500), NOW);
  assert.equal(stageOf(hydrateBidRecords(s, [rec], NOW + 5_000)), 'paying');
  assert.equal(stageOf(hydrateBidRecords(s, [rec], NOW + 11_000)), 'waiting');
  // an old server's card (no window) is not touched
  const old = paying(withBid(3500), NOW, {});
  assert.equal(stageOf(hydrateBidRecords(old, [rec], NOW + 30_000)), 'paying');
});

test('paying with a past auction deadline stays paying until its time is up, then expired', () => {
  const base = withBid(3500);
  const bid = base.pendingBids['ride-1'];
  const past = { ...base, pendingBids: { 'ride-1': { ...bid, sentAt: new Date(NOW - 7_200_000).toISOString(), offer: { ...bid.offer, expiresAt: new Date(NOW - 7_000_000).toISOString() } } } };
  const s = paying(past, NOW);
  assert.equal(stageOf(pruneExpiredBids(s, NOW + 60_000)), 'paying');
  assert.equal(stageOf(pruneExpiredBids(s, NOW + 121_000)), 'expired');
});

test('the bid screen hides the red search countdown while paying', async () => {
  const { readFileSync } = await import('node:fs');
  assert.match(readFileSync(join(projectRoot, 'app/driver/pending-bid.tsx'), 'utf8'), /\{!accepted && stage !== 'paying' \? \(\(\) => \{/);
});
