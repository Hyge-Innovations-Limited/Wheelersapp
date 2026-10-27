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
const { routeQuoteFrom, routeQuoteNeedsAsk, routeQuoteLine, applyAutoAcceptReply, routeQuoteAnswerFrom, isUnknownQuoteType, ROUTE_NOT_PRICED } = createRequire(import.meta.url)(outFile);

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
