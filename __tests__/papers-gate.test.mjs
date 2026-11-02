/**
 * The papers gate on a driver's tap on Go online. The automatic return online
 * after the app was closed (lib/driver-session.tsx) never passes through it.
 *
 *   node --test __tests__/papers-gate.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const dir = mkdtempSync(join(tmpdir(), 'wheelers-papers-gate-'));
const outFile = join(dir, 'bundle.cjs');
execFileSync('npx', ['esbuild', join(projectRoot, 'lib/papers-gate.ts'), '--bundle', '--platform=node', '--format=cjs', `--outfile=${outFile}`], { cwd: projectRoot, stdio: 'pipe' });
const { checkPapersGate, PAPERS_GATE_BODY } = createRequire(import.meta.url)(outFile);

const getToken = async () => 'tok';

// Mirrors the screens: gate first, then alert or go online.
async function tapGoOnline(fetchPapers, extra = {}) {
  const calls = { online: 0, alerts: [], pushed: [] };
  const gate = await checkPapersGate({ getToken, fetchPapers, ...extra });
  if (!gate.ok) {
    calls.alerts.push({
      title: 'Send your papers first',
      body: PAPERS_GATE_BODY,
      buttons: [{ text: 'Not now', style: 'cancel' }, { text: 'Send papers', onPress: () => calls.pushed.push('/driver/docs') }],
    });
  } else calls.online += 1;
  return calls;
}

test('nothing to do: goes online', async () => {
  const c = await tapGoOnline(async () => ({ toDo: 0 }));
  assert.equal(c.online, 1);
  assert.equal(c.alerts.length, 0);
});

test('papers to do: stays offline, alert opens Your papers', async () => {
  const c = await tapGoOnline(async () => ({ toDo: 2 }));
  assert.equal(c.online, 0);
  assert.equal(c.alerts[0].title, 'Send your papers first');
  assert.equal(c.alerts[0].body, 'Send what is missing to go online.');
  assert.deepEqual(c.alerts[0].buttons.map((b) => b.text), ['Not now', 'Send papers']);
  c.alerts[0].buttons[1].onPress();
  assert.deepEqual(c.pushed, ['/driver/docs']);
});

test('papers call fails: goes online as before', async () => {
  const c = await tapGoOnline(async () => { throw new Error('Network request failed'); });
  assert.equal(c.online, 1);
  assert.equal(c.alerts.length, 0);
});

test('papers call hangs: goes online after the timeout', async () => {
  const c = await tapGoOnline(() => new Promise(() => {}), { timeoutMs: 20 });
  assert.equal(c.online, 1);
});

test('no token: goes online', async () => {
  const g = await checkPapersGate({ getToken: async () => null, fetchPapers: async () => ({ toDo: 3 }) });
  assert.deepEqual(g, { ok: true });
});

test('automatic return online is not gated: session goOnline never calls the gate', () => {
  const session = readFileSync(join(projectRoot, 'lib/driver-session.tsx'), 'utf8');
  assert.ok(!session.includes('papers-gate'));
  for (const f of ['app/driver/dashboard.tsx', 'app/driver/(tabs)/home.tsx']) {
    assert.ok(readFileSync(join(projectRoot, f), 'utf8').includes('checkPapersGate'), f);
  }
});

for (const f of ['app/driver/dashboard.tsx', 'app/driver/(tabs)/home.tsx']) {
  test(`${f}: handleToggleOnline gates before the location prompt and goOnline, and guards double taps`, () => {
    const src = readFileSync(join(projectRoot, f), 'utf8');
    const a = src.indexOf('const handleToggleOnline');
    assert.ok(a > 0);
    const h = src.slice(a, src.indexOf('\n  };\n', a));
    const g = h.indexOf('checkPapersGate(');
    assert.ok(g > 0);
    assert.ok(g < h.indexOf('requestBackgroundLocationAccess()'));
    assert.ok(g < h.indexOf('goOnline('));
    const blk = h.slice(h.indexOf('if (!gate.ok)'));
    assert.ok(blk.slice(0, blk.indexOf('}\n')).includes('return;'));
    assert.ok(h.includes('PAPERS_GATE_BODY') && src.includes('PAPERS_GATE_BODY }'));
    assert.ok(h.includes('Send your papers first') && h.includes("'/driver/docs'"));
    assert.ok(h.includes('if (togglingRef.current) return;') && h.includes('togglingRef.current = false;'));
    assert.ok(h.indexOf('togglingRef.current = true') < g);
  });
}
