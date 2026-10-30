/**
 * Changing where a booked trip goes: the server's quote first, and the rider
 * asked when money moves ("₦800 more will be held", "₦500 back to your wallet").
 *
 *   node --test __tests__/route-quote.test.mjs
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
const dir = mkdtempSync(join(tmpdir(), 'wheelers-route-quote-'));
const entry = join(dir, 'entry.ts');
writeFileSync(entry, `
export * from '${join(projectRoot, 'lib/route-quote.ts')}';
export * from '${join(projectRoot, 'lib/auto-accept.ts')}';
`);
const outFile = join(dir, 'bundle.cjs');
execFileSync('npx', ['esbuild', entry, '--bundle', '--platform=node', '--format=cjs', `--outfile=${outFile}`], { cwd: projectRoot, stdio: 'pipe' });
const { routeQuoteFrom, routeQuoteNeedsAsk, routeQuoteLine, applyAutoAcceptReply, routeQuoteAnswerFrom, isUnknownQuoteType, ROUTE_NOT_PRICED, routeUpdateReplyFrom, routeOutcomeFrom, routeUpdatedFareFrom, routePendingExpired, routeUpdateWaitMatches, routeUpdateAnswerFrom, routeInProgressFailure, routeInProgressWaitMatches, routeUpdatedIsRequested, pendingCancelWaitMatches, pendingCancelAnswerFrom, ROUTE_UPDATE_FAILED, PENDING_CANCEL_FAILED } = createRequire(import.meta.url)(outFile);

test('the quote, from the server\'s answer or a PRICE_CHANGED refusal', () => {
  assert.deepEqual(routeQuoteFrom({ rideId: 'r', fareNgn: 5200, extraNgn: 800 }), { fareNgn: 5200, extraNgn: 800 });
  assert.deepEqual(routeQuoteFrom({ reason: 'PRICE_CHANGED', fareNgn: 5300.4, extraNgn: 900 }), { fareNgn: 5300, extraNgn: 900 });
  assert.deepEqual(routeQuoteFrom({ fareNgn: 4000 }), { fareNgn: 4000, extraNgn: 0 });
  assert.equal(routeQuoteFrom({}), null);
  assert.equal(routeQuoteFrom({ fareNgn: 0 }), null);
});

test('money moves: asked first, in the rider\'s words; nothing moves: no question', () => {
  assert.equal(routeQuoteNeedsAsk({ fareNgn: 5200, extraNgn: 800 }), true);
  assert.equal(routeQuoteLine({ fareNgn: 5200, extraNgn: 800 }), '₦800 more will be held');
  assert.equal(routeQuoteNeedsAsk({ fareNgn: 3900, extraNgn: -500 }), true);
  assert.equal(routeQuoteLine({ fareNgn: 3900, extraNgn: -500 }), '₦500 back to your wallet');
  assert.equal(routeQuoteNeedsAsk({ fareNgn: 4400, extraNgn: 0 }), false);
  assert.equal(routeQuoteLine({ fareNgn: 4400, extraNgn: 0 }), null);
});

test('auto-booking switched off after a raise (price_changed): off, quietly', () => {
  const r = applyAutoAcceptReply({ rideId: 'ride-1', autoAcceptChosen: true, autoAccept: true }, 'ride:auto_accept:done', { rideId: 'ride-1', on: false, reason: 'price_changed' });
  assert.equal(r.ride.autoAcceptChosen, false);
  assert.equal(r.ride.autoAccept, false);
  assert.equal(r.error, null);
});

test('only an older server\'s "Unknown event type: ride:route:quote" lets the change go unpriced', () => {
  assert.deepEqual(routeQuoteAnswerFrom('error', { message: 'Unknown event type: ride:route:quote' }, 'ride-1'), { kind: 'unpriced' });
  assert.equal(isUnknownQuoteType('error', { message: 'Unknown event type: ride:route:update' }), false);
  assert.equal(routeQuoteAnswerFrom('error', { message: 'This ride is not yours.' }, 'ride-1'), null, 'any other error is not an answer: nothing is sent');
  assert.equal(routeQuoteAnswerFrom('error', { message: 'Wheelers is only in Lagos for now.' }, 'ride-1'), null);
  assert.equal(routeQuoteAnswerFrom('error', {}, 'ride-1'), null);
});

test('the quote for this ride is the answer; another ride\'s, or a bad one, is not', () => {
  assert.deepEqual(routeQuoteAnswerFrom('ride:route:quote:result', { rideId: 'ride-1', fareNgn: 5200, extraNgn: 800 }, 'ride-1'), { kind: 'quote', quote: { fareNgn: 5200, extraNgn: 800 } });
  assert.equal(routeQuoteAnswerFrom('ride:route:quote:result', { rideId: 'ride-2', fareNgn: 5200, extraNgn: 800 }, 'ride-1'), null);
  assert.equal(routeQuoteAnswerFrom('ride:route:quote:result', { rideId: 'ride-1' }, 'ride-1'), null);
  assert.equal(ROUTE_NOT_PRICED, 'Could not price that route. Try again.');
});

test('a refused quote shows the server\'s message; an old server is unpriced', () => {
  const refused = routeQuoteAnswerFrom('error', { requestType: 'ride:route:quote', message: 'That is the route you already have.' }, 'r');
  assert.deepEqual(refused, { kind: 'refused', message: 'That is the route you already have.' });
  assert.deepEqual(routeQuoteAnswerFrom('error', { requestType: 'ride:route:quote', message: 'Unknown event type: ride:route:quote' }, 'r'), { kind: 'unpriced' });
  assert.equal(routeQuoteAnswerFrom('error', { requestType: 'ride:request', message: 'x' }, 'r'), null);
});

test('update answers: accepted, in progress, updated', () => {
  assert.deepEqual(routeUpdateReplyFrom('ride:route:update:accepted', { rideId: 'r', fareNgn: 5200 }), { kind: 'done', inProgress: false });
  assert.deepEqual(routeUpdateReplyFrom('ride:route:update:accepted', { rideId: 'r', inProgress: true }), { kind: 'done', inProgress: true });
  assert.deepEqual(routeUpdateReplyFrom('ride:route:updated', { rideId: 'r' }), { kind: 'done', inProgress: false });
  assert.equal(routeUpdateReplyFrom('ride:route:quote:result', {}), null);
});

test('update answers: PRICE_CHANGED asks again at the new price', () => {
  assert.deepEqual(routeUpdateReplyFrom('ride:route:update:rejected', { reason: 'PRICE_CHANGED', fareNgn: 5300, extraNgn: 900, message: 'm' }), { kind: 'price_changed', quote: { fareNgn: 5300, extraNgn: 900 } });
});

test('update answers: WALLET_SHORT carries the add-money amount', () => {
  const r = routeUpdateReplyFrom('ride:route:update:rejected', { reason: 'WALLET_SHORT', fareNgn: 5200, extraNgn: 800, neededNgn: 300, balanceNgn: 500, pendingUntil: '2026-10-29T12:30:00.000Z', message: 'm' });
  assert.deepEqual(r, { kind: 'wallet_short', quote: { fareNgn: 5200, extraNgn: 800 }, neededNgn: 300, sendNgn: 300, balanceNgn: 500, pendingUntil: '2026-10-29T12:30:00.000Z' });
  // no pendingUntil / balance from a thinner payload still works
  const thin = routeUpdateReplyFrom('ride:route:update:rejected', { reason: 'WALLET_SHORT', fareNgn: 5200, extraNgn: 800, neededNgn: 300 });
  assert.equal(thin.pendingUntil, null);
  assert.equal(thin.neededNgn, 300);
});

test('update answers: any other refusal is an error with its message', () => {
  assert.deepEqual(routeUpdateReplyFrom('ride:route:update:rejected', { message: 'No.' }), { kind: 'refused', message: 'No.' });
  assert.equal(routeUpdateReplyFrom('ride:route:update:rejected', {}).kind, 'refused');
  // WALLET_SHORT with nothing needed is not an add-money screen
  assert.equal(routeUpdateReplyFrom('ride:route:update:rejected', { reason: 'WALLET_SHORT', fareNgn: 5200, extraNgn: 0, neededNgn: 0 }).kind, 'refused');
});

test('after the deposit: appliedAfterDeposit / alreadyApplied close the add-money screen', () => {
  assert.deepEqual(routeOutcomeFrom('ride:route:update:accepted', { appliedAfterDeposit: true }), { kind: 'applied' });
  assert.deepEqual(routeOutcomeFrom('ride:route:update:accepted', { alreadyApplied: true }), { kind: 'applied' });
  assert.equal(routeOutcomeFrom('ride:route:update:accepted', { fareNgn: 1 }), null);
  assert.equal(routeOutcomeFrom('ride:route:update:accepted', { inProgress: true }), null);
});

test('dropped: one short line, the real route', () => {
  assert.deepEqual(routeOutcomeFrom('ride:route:update:dropped', { reason: 'TRIP_CHANGED' }), { kind: 'dropped' });
});

test('backing out: cancelled true leaves the trip; false waits for the applied route', () => {
  assert.deepEqual(pendingCancelAnswerFrom({ type: 'ride:route:pending:cancelled', payload: { rideId: 'r', cancelled: true } }), { kind: 'cancelled', cancelled: true });
  assert.deepEqual(pendingCancelAnswerFrom({ type: 'ride:route:pending:cancelled', payload: { rideId: 'r', cancelled: false } }), { kind: 'cancelled', cancelled: false });
});

test('ride:route:updated carries the new fare only from a new server', () => {
  assert.equal(routeUpdatedFareFrom({ fareNgn: 5200.4, change: 'stop_added' }), 5200);
  assert.equal(routeUpdatedFareFrom({ destination: {} }), null);
  assert.equal(routeUpdatedFareFrom({ fareNgn: 0 }), null);
});

test('an old server: no new fields, nothing new happens', () => {
  assert.equal(routeOutcomeFrom('ride:route:updated', { destination: {} }), null);
  assert.deepEqual(routeUpdateReplyFrom('ride:route:update:accepted', { rideId: 'r', destination: {}, stops: [] }), { kind: 'done', inProgress: false });
  assert.deepEqual(routeQuoteAnswerFrom('error', { message: 'Unknown event type: ride:route:quote' }, 'r'), { kind: 'unpriced' });
});

test('a waiting change runs out at pendingUntil', () => {
  assert.equal(routePendingExpired('2026-10-29T12:30:00.000Z', Date.parse('2026-10-29T12:29:59.000Z')), false);
  assert.equal(routePendingExpired('2026-10-29T12:30:00.000Z', Date.parse('2026-10-29T12:30:00.000Z')), true);
  assert.equal(routePendingExpired(null, Date.now()), false);
});

test('WALLET_SHORT: the amount to send is sendNgn, else neededNgn; no neededNgn is a refusal', () => {
  const base = { reason: 'WALLET_SHORT', fareNgn: 5200, extraNgn: 800, balanceNgn: 500 };
  assert.equal(routeUpdateReplyFrom('ride:route:update:rejected', { ...base, neededNgn: 300, sendNgn: 350 }).sendNgn, 350);
  assert.equal(routeUpdateReplyFrom('ride:route:update:rejected', { ...base, neededNgn: 300 }).sendNgn, 300);
  assert.equal(routeUpdateReplyFrom('ride:route:update:rejected', base).kind, 'refused');
});

test('a priced update waits for its own error only', () => {
  assert.equal(routeUpdateWaitMatches('error', { requestType: 'ride:route:update', message: 'x' }), true);
  assert.equal(routeUpdateWaitMatches('error', { requestType: 'ride:route:quote', message: 'x' }), false);
  assert.equal(routeUpdateWaitMatches('error', { message: 'x' }), false);
  assert.equal(routeUpdateWaitMatches('ride:route:update:rejected', {}), true);
  assert.deepEqual(routeUpdateAnswerFrom({ type: 'error', payload: { requestType: 'ride:route:update', message: 'This trip can no longer change its route.' } }), { kind: 'refused', message: 'This trip can no longer change its route.' });
});

test('a priced update with no answer is a failure, not a success', () => {
  assert.deepEqual(routeUpdateAnswerFrom(null), { kind: 'refused', message: ROUTE_UPDATE_FAILED });
  assert.equal(ROUTE_UPDATE_FAILED, 'Could not update the route. Try again.');
});

test('in progress: only ride:route:updated is the success', () => {
  assert.equal(routeInProgressFailure({ type: 'ride:route:updated', payload: {} }), null);
  assert.equal(routeInProgressFailure(null), ROUTE_UPDATE_FAILED);
  assert.equal(routeInProgressFailure({ type: 'error', payload: { requestType: 'ride:route:update', message: 'No.' } }), 'No.');
  assert.equal(routeInProgressWaitMatches('error', { requestType: 'ride:request' }), false);
  assert.equal(routeInProgressWaitMatches('ride:route:updated', {}), true);
});

test('backing out: an error or no answer is a failure; other requests\' errors are ignored', () => {
  assert.equal(pendingCancelWaitMatches('error', { requestType: 'ride:route:pending:cancel' }), true);
  assert.equal(pendingCancelWaitMatches('error', { requestType: 'ride:route:update' }), false);
  assert.equal(pendingCancelWaitMatches('ride:route:pending:cancelled', {}), true);
  assert.deepEqual(pendingCancelAnswerFrom({ type: 'error', payload: { requestType: 'ride:route:pending:cancel', message: 'Not yours.' } }), { kind: 'failed', message: 'Not yours.' });
  assert.deepEqual(pendingCancelAnswerFrom(null), { kind: 'failed', message: PENDING_CANCEL_FAILED });
});

test('in progress: only the requested route counts, not a driver\'s stop reached', () => {
  const requested = { destination: { lat: 6.5, lng: 3.4 }, stops: [{ lat: 6.6, lng: 3.3 }] };
  const same = { destination: { lat: 6.5, lng: 3.4, address: 'x' }, stops: [{ lat: 6.6, lng: 3.3 }] };
  const reached = { destination: { lat: 6.5, lng: 3.4 }, stops: [] };
  assert.equal(routeUpdatedIsRequested(same, requested), true);
  assert.equal(routeUpdatedIsRequested(reached, requested), false);
  assert.equal(routeUpdatedIsRequested({}, requested), false);
  assert.equal(routeInProgressWaitMatches('ride:route:updated', reached, requested), false);
  assert.equal(routeInProgressWaitMatches('ride:route:updated', same, requested), true);
  assert.equal(routeInProgressWaitMatches('error', { requestType: 'ride:route:update' }, requested), true);
});

test('CANCELLED and unknown rejection reasons are "not changed", never a success', () => {
  assert.deepEqual(routeUpdateReplyFrom('ride:route:update:rejected', { reason: 'CANCELLED', message: 'This trip was cancelled.' }), { kind: 'refused', message: 'This trip was cancelled.' });
  assert.equal(routeUpdateReplyFrom('ride:route:update:rejected', { reason: 'SOMETHING_NEW' }).kind, 'refused');
  assert.equal(routeUpdateReplyFrom('ride:route:update:rejected', { reason: 'CANCELLED', fareNgn: 5000, extraNgn: 0 }).kind, 'refused');
});

test('an unsolicited PRICE_CHANGED while waiting asks again at the new price', () => {
  const payload = { rideId: 'r1', reason: 'PRICE_CHANGED', fareNgn: 5600, extraNgn: 1200, message: 'm' };
  assert.deepEqual(routeOutcomeFrom('ride:route:update:rejected', payload, 'r1'), { kind: 'price_changed', quote: { fareNgn: 5600, extraNgn: 1200 } });
  assert.equal(routeOutcomeFrom('ride:route:update:rejected', { reason: 'CANCELLED' }, 'r1'), null);
  assert.equal(routeOutcomeFrom('ride:route:update:rejected', { reason: 'PRICE_CHANGED' }, 'r1'), null);
});

test('accepted, dropped and rejected for another ride are ignored', () => {
  assert.equal(routeOutcomeFrom('ride:route:update:accepted', { rideId: 'other', appliedAfterDeposit: true }, 'r1'), null);
  assert.equal(routeOutcomeFrom('ride:route:update:dropped', { rideId: 'other' }, 'r1'), null);
  assert.equal(routeOutcomeFrom('ride:route:update:rejected', { rideId: 'other', reason: 'PRICE_CHANGED', fareNgn: 5, extraNgn: 1 }, 'r1'), null);
  assert.deepEqual(routeOutcomeFrom('ride:route:update:dropped', { rideId: 'r1' }, 'r1'), { kind: 'dropped' });
  assert.deepEqual(routeOutcomeFrom('ride:route:update:dropped', {}, 'r1'), { kind: 'dropped' });
});
