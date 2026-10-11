#!/usr/bin/env node
/**
 * Runs a command with the settings the app needs to start on a computer.
 *
 * Wheelers is one app now: riders and drivers are both in the "rider" build
 * (the person picks Ride or Drive inside it), so `npm run app` is the one
 * command to start it. The Google keys are the same ones the OTA scripts in
 * package.json already carry; they are read from there so there is one copy.
 *
 * Which server it talks to: EXPO_PUBLIC_API_BASE_URL if you set it, else the
 * one on this computer (http://localhost:4000). To use the live server:
 *
 *   EXPO_PUBLIC_API_BASE_URL=https://app.wheelersng.com npm run app
 */
const { spawn } = require("node:child_process");
const scripts = require("../package.json").scripts;

const env = { ...process.env };
const live = scripts["ota:rider"] ?? "";
for (const match of live.matchAll(/\b(EXPO_PUBLIC_[A-Z_]+)=(\S+)/g)) {
  const [, name, value] = match;
  if (name === "EXPO_PUBLIC_APP_VARIANT" || name === "EXPO_PUBLIC_API_BASE_URL") continue;
  if (!env[name]) env[name] = value;
}
if (!env.EXPO_PUBLIC_API_BASE_URL) env.EXPO_PUBLIC_API_BASE_URL = "http://localhost:4000";

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error("usage: with-app-env.js <command> [args]");
  process.exit(1);
}
console.log(`Wheelers (one app) -> ${env.EXPO_PUBLIC_API_BASE_URL}`);
const child = spawn("npx", [command, ...args], { stdio: "inherit", env });
child.on("exit", (code) => process.exit(code ?? 0));
