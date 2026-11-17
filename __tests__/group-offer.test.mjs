/**
 * A group ride offer in the app (Timi, 16-17 Nov 2026): the server's view read and worded the same as the ride page.
 *
 *   node --test __tests__/group-offer.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const req = createRequire(import.meta.url);
function build(file) {
  const outFile = join(mkdtempSync(join(tmpdir(), 'wheelers-group-')), 'out.cjs');
  execFileSync('npx', ['esbuild', join(projectRoot, file), '--bundle', '--platform=node', '--format=cjs', `--outfile=${outFile}`], { cwd: projectRoot, stdio: 'pipe' });
  return req(outFile);
}
const G = build('lib/group-offer.ts');
const AT = Date.parse('2026-11-17T08:00:00Z');
const server = (extra = {}) => ({
  offerId: 'o1', expiresAt: new Date(AT + 20_000).toISOString(), selfieDeadline: new Date(AT + 80_000).toISOString(),
  ownPriceNgn: 12000, seatPriceNgn: 9000, savedNgn: 3000, extraMinutes: 6, people: 2, answer: null, selfieNeeded: false,
  riders: [{ you: true, name: 'You', pickup: 'Yaba' }, { you: false, name: 'Chika', pickup: 'Ketu' }],
  stops: [{ kind: 'pickup', address: 'Yaba', you: true }, { kind: 'dropoff', address: 'Ikorodu Garage, Lagos', you: true }],
  ...extra,
});

test('the server\'s offer is read: the seat, the others, where you get out; junk is nothing', () => {
  const o = G.parseGroupOffer(server());
  assert.deepEqual([o.offerId, o.seatPriceNgn, o.ownPriceNgn, o.savedNgn, o.extraMinutes, o.people, o.dropoff], ['o1', 9000, 12000, 3000, 6, 2, 'Ikorodu Garage']);
  assert.equal(o.expiresAtMs, AT + 20_000);
  assert.equal(G.groupOfferTitle(o), '1 rider is going your way');
  assert.equal(G.groupOfferTitle({ riders: [{ you: true }, { you: false }, { you: false }] }), '2 riders are going your way');
  assert.equal(G.parseGroupOffer(null), null);
  assert.equal(G.parseGroupOffer({ offerId: 'x' }), null);
});

test('the step: ask, then the selfie for a yes without one, then waiting; a No is the end', () => {
  assert.equal(G.groupStep({ answer: null, selfieNeeded: true }), 'ask');
  assert.equal(G.groupStep({ answer: 'join', selfieNeeded: true }), 'selfie');
  assert.equal(G.groupStep({ answer: 'join', selfieNeeded: false }), 'waiting');
  assert.equal(G.groupStep({ answer: 'decline', selfieNeeded: false }), 'declined');
  assert.equal(G.formedLine({ seatPriceNgn: 9000, others: ['Chika', 'Tunde'] }, (n) => `₦${n.toLocaleString('en-NG')}`), "You're riding together with Chika and Tunde. Your seat: ₦9,000. Finding your driver.");
});
