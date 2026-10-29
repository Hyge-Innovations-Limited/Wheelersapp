/**
 * The pay sheet tells the server (the driver sees "paying now"): one open per
 * sheet, one close on every exit, and the server's refusals dropped silently.
 *
 *   node --test __tests__/pay-sheet-signal.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const projectRoot = join(here, '..');
const outFile = join(mkdtempSync(join(tmpdir(), 'wheelers-pay-sheet-')), 'bundle.cjs');
execFileSync('npx', ['esbuild', join(projectRoot, 'lib/pay-sheet-signal.ts'), '--bundle', '--platform=node', '--format=cjs', `--outfile=${outFile}`], { cwd: projectRoot, stdio: 'pipe' });
const { trackPaySheet, isPaySheetError, payingDriverId, releaseAccepting, addMoneyStep } = createRequire(import.meta.url)(outFile);

const recorder = () => {
  const calls = [];
  return { calls, send: (driverId, open) => calls.push(`${open ? 'open' : 'close'}:${driverId}`) };
};

test('one open when the sheet shows', () => {
  const r = recorder();
  trackPaySheet(r.send, 'd1');
  assert.deepEqual(r.calls, ['open:d1']);
});

test('every exit (Back, swipe down, Keep looking, booked, cancelled, unmount) closes exactly once', () => {
  const r = recorder();
  const t = trackPaySheet(r.send, 'd1');
  t.dispose();
  t.dispose();
  assert.deepEqual(r.calls, ['open:d1', 'close:d1']);
});

test('another driver: close the old one, then open the new one', () => {
  const r = recorder();
  const a = trackPaySheet(r.send, 'd1');
  a.dispose();
  const b = trackPaySheet(r.send, 'd2');
  b.dispose();
  assert.deepEqual(r.calls, ['open:d1', 'close:d1', 'open:d2', 'close:d2']);
});

test('the tracker has no background close: leaving for the bank app keeps it open', () => {
  const r = recorder();
  const t = trackPaySheet(r.send, 'd1');
  assert.equal(t.setAway, undefined);
  assert.deepEqual(r.calls, ['open:d1']);
});

test('a send that throws never breaks the pay flow', () => {
  const t = trackPaySheet(() => { throw new Error('boom'); }, 'd1');
  assert.doesNotThrow(() => { t.dispose(); });
});

test('pay-sheet errors are swallowed; no other error is', () => {
  assert.equal(isPaySheetError('error', { requestType: 'ride:pay_sheet', message: 'anything at all' }), true);
  assert.equal(isPaySheetError('error', { message: 'Unknown event type: ride:pay_sheet' }), true);
  assert.equal(isPaySheetError('error', { requestType: 'ride:accept_offer', message: 'This ride is not yours.' }), false);
  assert.equal(isPaySheetError('error', { message: 'This ride is not yours.' }), false);
  assert.equal(isPaySheetError('error', { message: 'Unknown event type: ride:other' }), false);
  assert.equal(isPaySheetError('ride:counter_offer', { requestType: 'ride:pay_sheet' }), false);
});

/** A tiny stand-in for matching.tsx: same key keeps the tracker, a new key disposes it and opens the next. */
function screen() {
  const r = recorder();
  let key = null;
  let tracker = null;
  let accepting = null;
  let addMoney = null;
  let wentAway = false;
  const render = ({ sheet = null, isSubmitting = false, status = 'bidding', isFocused = true }) => {
    // The effects, to a fixed point.
    for (let i = 0; i < 3; i += 1) {
      if (releaseAccepting({ acceptingFor: accepting, isSubmitting, status })) accepting = null;
      const step = addMoneyStep({ addMoneyFor: addMoney, wentAway, isFocused });
      wentAway = step.wentAway;
      if (step.release) addMoney = null;
    }
    const next = payingDriverId({ sheetDriverId: sheet, acceptingFor: accepting, addMoneyFor: addMoney });
    if (next !== key) {
      tracker?.dispose();
      tracker = next ? trackPaySheet(r.send, next) : null;
      key = next;
    }
  };
  return {
    calls: r.calls,
    render,
    tapPay: (id) => { accepting = id; },
    toAddMoney: (id) => { addMoney = id; wentAway = false; },
    unmount: () => tracker?.dispose(),
  };
}

test('Pay: held through the accept, one close when it is refused', () => {
  const s = screen();
  s.render({ sheet: 'X' });
  s.tapPay('X');
  s.render({ sheet: null, isSubmitting: true, status: 'bidding' });
  s.render({ sheet: null, isSubmitting: true, status: 'matching' });
  s.render({ sheet: null, isSubmitting: false, status: 'matching' });
  assert.deepEqual(s.calls, ['open:X']);
  s.render({ sheet: null, isSubmitting: false, status: 'bidding' });
  assert.deepEqual(s.calls, ['open:X', 'close:X']);
  s.render({ sheet: null });
  assert.deepEqual(s.calls, ['open:X', 'close:X']);
});

test('Pay: matching to matched gives one close at the end', () => {
  const s = screen();
  s.render({ sheet: 'X' });
  s.tapPay('X');
  s.render({ isSubmitting: true, status: 'matching' });
  s.render({ status: 'matching' });
  assert.deepEqual(s.calls, ['open:X']);
  s.render({ status: 'matched' });
  s.render({ status: 'matched' });
  assert.deepEqual(s.calls, ['open:X', 'close:X']);
});

test('Pay: a send that failed (bidding, not submitting) closes', () => {
  const s = screen();
  s.render({ sheet: 'X' });
  s.tapPay('X');
  s.render({ isSubmitting: false, status: 'bidding' });
  assert.deepEqual(s.calls, ['open:X', 'close:X']);
});

test('Add money: kept open across the other screen, one close when focus returns', () => {
  const s = screen();
  s.render({ sheet: 'X' });
  s.toAddMoney('X');
  s.render({ sheet: null, isFocused: true });
  s.render({ sheet: null, isFocused: false });
  s.render({ sheet: null, isFocused: false });
  assert.deepEqual(s.calls, ['open:X']);
  s.render({ sheet: null, isFocused: true });
  assert.deepEqual(s.calls, ['open:X', 'close:X']);
});

test('Add money: the sheet reopening for another driver closes the old, opens the new', () => {
  const s = screen();
  s.render({ sheet: 'X' });
  s.toAddMoney('X');
  s.render({ isFocused: false });
  s.render({ sheet: 'Y', isFocused: true });
  assert.deepEqual(s.calls, ['open:X', 'close:X', 'open:Y']);
  s.unmount();
  assert.deepEqual(s.calls, ['open:X', 'close:X', 'open:Y', 'close:Y']);
});

test('wiring: matching.tsx uses these functions and has no AppState; the session drops the replies', () => {
  const session = readFileSync(join(projectRoot, 'lib/ride-session.tsx'), 'utf8');
  assert.match(session, /sendEnvelope\('ride:pay_sheet'/);
  assert.match(session, /isPaySheetError\(type, payload\)/);
  const screen = readFileSync(join(projectRoot, 'app/matching.tsx'), 'utf8');
  for (const fn of ['trackPaySheet(notifyPaySheet', 'payingDriverId(', 'releaseAccepting(', 'addMoneyStep(']) {
    assert.ok(screen.includes(fn), fn);
  }
  assert.doesNotMatch(screen, /AppState/);
});

test('payingDriverId: the sheet wins over add-money and accepting', () => {
  assert.equal(payingDriverId({ sheetDriverId: 'Y', acceptingFor: null, addMoneyFor: 'X' }), 'Y');
  assert.equal(payingDriverId({ sheetDriverId: null, acceptingFor: 'A', addMoneyFor: 'X' }), 'A');
  assert.equal(payingDriverId({ sheetDriverId: null, acceptingFor: null, addMoneyFor: null }), null);
});
