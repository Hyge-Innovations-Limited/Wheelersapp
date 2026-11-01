#!/usr/bin/env node
/**
 * Before a store build: the next app version (1.0.6 → 1.0.7) and iOS build
 * number in app.json, committed on its own so the repo says what shipped.
 * EAS counts the store build numbers itself (appVersionSource: remote,
 * autoIncrement); the buildNumber here is for scripts/ios-release.sh.
 * The OTA runtime version is pinned in app.config.js and does not move.
 *
 *   node scripts/bump-version.js            → bump and commit app.json
 *   node scripts/bump-version.js --no-commit
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const file = path.join(__dirname, '..', 'app.json');
const app = JSON.parse(fs.readFileSync(file, 'utf8'));

const parts = String(app.expo.version).split('.').map(Number);
if (parts.length !== 3 || parts.some((n) => !Number.isInteger(n) || n < 0)) {
  console.error(`app.json version "${app.expo.version}" is not x.y.z`);
  process.exit(1);
}
const from = app.expo.version;
parts[2] += 1;
app.expo.version = parts.join('.');
if (app.expo.ios?.buildNumber) app.expo.ios.buildNumber = String(Number(app.expo.ios.buildNumber) + 1);

fs.writeFileSync(file, `${JSON.stringify(app, null, 2)}\n`);
console.log(`Version ${from} → ${app.expo.version}${app.expo.ios?.buildNumber ? ` (iOS build ${app.expo.ios.buildNumber})` : ''}`);

if (!process.argv.includes('--no-commit')) {
  execFileSync('git', ['commit', '-q', '-m', `Version ${app.expo.version}`, '--', 'app.json'], { stdio: 'inherit' });
}
