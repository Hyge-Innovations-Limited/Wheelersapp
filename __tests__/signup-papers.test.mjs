/**
 * The sign-up papers step sends the application only when every required
 * paper is in. A paper sent and waiting to be checked counts as in; one
 * sent back or expired does not; an optional one never holds it up.
 *
 *   node --test __tests__/signup-papers.test.mjs
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
const outFile = join(mkdtempSync(join(tmpdir(), 'wheelers-signup-papers-')), 'bundle.cjs');
execFileSync('npx', ['esbuild', join(projectRoot, 'lib/papers-gate.ts'), '--bundle', '--platform=node', '--format=cjs', `--outfile=${outFile}`], { cwd: projectRoot, stdio: 'pipe' });
const { papersStillToSend } = createRequire(import.meta.url)(outFile);

const need = (label, state, required = true) => ({ key: label, label, required, state, papers: [] });

test('every required paper in (sent or approved): nothing left', () => {
  assert.deepEqual(papersStillToSend({ needs: [need('Hackney permit', 'waiting'), need('Insurance', 'approved')] }), []);
});

test('missing, sent back and expired are still to send, in order', () => {
  const needs = [need('Hackney permit', 'missing'), need('Insurance', 'waiting'), need('Vehicle licence', 'rejected'), need('Roadworthiness', 'expired')];
  assert.deepEqual(papersStillToSend({ needs }), ['Hackney permit', 'Vehicle licence', 'Roadworthiness']);
});

test('an optional paper never holds up the application', () => {
  assert.deepEqual(papersStillToSend({ needs: [need('Extra', 'missing', false)] }), []);
});

test('the papers step is the one that sends, and its button stays off until nothing is left', () => {
  const screen = readFileSync(join(projectRoot, 'app/driver/onboarding/papers.tsx'), 'utf8');
  assert.match(screen, /useKycStep\('papers'\)/);
  assert.match(screen, /disabled=\{!ready\}/);
  assert.match(screen, /const ready = missing !== null && missing\.length === 0;/, 'not ready while the list is still loading or failed');
  assert.match(screen, /from=signup/, 'the upload screen knows to come back here');
});

test('the details step needs the licence number and expiry, and they are sent', () => {
  const details = readFileSync(join(projectRoot, 'app/driver/onboarding/your-details.tsx'), 'utf8');
  assert.match(details, /const valid = nameOk && licenceOk && expiresOk;/);
  const onboarding = readFileSync(join(projectRoot, 'lib/driver-onboarding.tsx'), 'utf8');
  assert.match(onboarding, /step === 'details' && !\(data\.legalDetails\?\.licenceNumber && data\.legalDetails\.licenceExpiresOn\)/, 'an old draft with only a name asks again');
  assert.match(onboarding, /licenceNumber: data\.legalDetails!\.licenceNumber!/);
  assert.match(onboarding, /licenceExpiresOn: data\.legalDetails!\.licenceExpiresOn!/);
});
