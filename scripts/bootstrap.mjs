// Sets up a clone for local development. Safe to rerun: it only fills in what's missing.
//
//   pnpm bootstrap
//
// Checks Node, pnpm and Docker; installs; creates each surface's .env.local from its
// .env.example; fills in the local Supabase URL and publishable key; asks once for a
// Mapbox token for the mobile apps; builds the shared packages; and says what's missing
// for Android. Supabase is stopped again if this started it.
//
// Local only. Provisioning production is scripts/setup-supabase.sh and
// scripts/setup-cloudflare.sh.

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import {
  androidSdk,
  androidTool,
  buildSharedPackages,
  envPath,
  examplePath,
  fail,
  fillEnv,
  listAvds,
  MAPBOX_KEY,
  readEnv,
  relative,
  repoRoot,
  requireDocker,
  step,
  supabaseAsync,
  supabaseStatus,
  surfaces,
} from "./lib/local-dev.mjs";

const warnings = [];

// ── Tools ───────────────────────────────────────────────────────────────────

step("Checking Node, pnpm and Docker");
const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor < 22)
  fail(`Node ${process.versions.node} is too old: this repo needs 22+.`);
if (spawnSync("pnpm", ["--version"], { stdio: "ignore" }).status !== 0) {
  fail("pnpm isn't on PATH. `corepack enable` installs the version package.json names.");
}
requireDocker();
console.log("  All there.");

// ── Install ─────────────────────────────────────────────────────────────────

step("Installing dependencies");
if (spawnSync("pnpm", ["install"], { cwd: repoRoot, stdio: "inherit" }).status !== 0) {
  fail("`pnpm install` failed.");
}

// ── Env files ───────────────────────────────────────────────────────────────

step("Env files");
for (const surface of Object.keys(surfaces)) {
  const file = envPath(surface);
  if (existsSync(file)) {
    console.log(`  ${relative(file)} exists.`);
  } else {
    copyFileSync(examplePath(surface), file);
    console.log(`  Created ${relative(file)} from ${relative(examplePath(surface))}.`);
  }
}

// ── Supabase keys ───────────────────────────────────────────────────────────

step("Local Supabase URL and key");
let startedDb = false;
let status = await supabaseStatus();
if (!status) {
  startedDb = true;
  if ((await supabaseAsync(["start"])) !== 0) fail("Supabase didn't start.");
  status = await supabaseStatus();
}
// The publishable key (sb_publishable_…) where the CLI prints one, the legacy anon key
// otherwise. Never the secret or service-role key: these files reach a browser or an APK.
const apiUrl = status?.API_URL;
const publicKey = status?.PUBLISHABLE_KEY || status?.ANON_KEY;
if (!apiUrl || !publicKey) {
  warnings.push(
    "`supabase status` printed no API URL or publishable key; fill them in by hand.",
  );
} else {
  for (const [surface, { url, key, mobile }] of Object.entries(surfaces)) {
    // The Android emulator reaches this machine at 10.0.2.2.
    const reachable = mobile
      ? apiUrl.replace(/127\.0\.0\.1|localhost/, "10.0.2.2")
      : apiUrl;
    report(surface, fillEnv(envPath(surface), { [url]: reachable, [key]: publicKey }));
  }
}

function report(surface, { filled, kept }) {
  const file = relative(envPath(surface));
  if (filled.length > 0) console.log(`  ${file}: filled ${filled.join(", ")}`);
  if (kept.length > 0) console.log(`  ${file}: kept ${kept.join(", ")} as already set`);
}

// ── Mapbox ──────────────────────────────────────────────────────────────────

step("Mapbox token for the mobile apps");
const mobileSurfaces = Object.keys(surfaces).filter(
  (surface) => surfaces[surface].mobile,
);
const needToken = mobileSurfaces.filter(
  (surface) => !readEnv(envPath(surface))[MAPBOX_KEY],
);
if (needToken.length === 0) {
  console.log("  Already set.");
} else if (!process.stdin.isTTY) {
  warnings.push(
    `No ${MAPBOX_KEY} yet, so the mobile apps show no map. Rerun in a terminal to set it.`,
  );
} else {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const token = (await rl.question("  A public token (pk.…), or Enter to skip: ")).trim();
  rl.close();
  if (token === "") {
    warnings.push(`Skipped ${MAPBOX_KEY}: the mobile apps show no map until it's set.`);
  } else if (!token.startsWith("pk.")) {
    warnings.push(
      `That token doesn't start with pk., so it wasn't saved. Only a public token belongs in an app.`,
    );
  } else {
    for (const surface of needToken)
      report(surface, fillEnv(envPath(surface), { [MAPBOX_KEY]: token }));
  }
}

// ── Shared packages ─────────────────────────────────────────────────────────

step("Building the shared packages");
if (!buildSharedPackages())
  warnings.push("The shared packages don't build; see the errors above.");

// ── Android ─────────────────────────────────────────────────────────────────

step("Android");
if (!androidSdk()) {
  warnings.push(
    "No Android SDK found (ANDROID_HOME). Install Android Studio for the mobile apps.",
  );
} else {
  if (!androidTool("adb")) warnings.push("No adb: install the SDK platform-tools.");
  if (!androidTool("emulator"))
    warnings.push("No emulator: install it from the SDK Manager.");
  else if (listAvds().length === 0)
    warnings.push("No AVD: create one in Android Studio's Device Manager.");
}
const anyDevBuild = mobileSurfaces.some((surface) =>
  existsSync(`${surfaces[surface].dir}/android`),
);
console.log(
  anyDevBuild
    ? "  SDK checked. `pnpm <app> --native` rebuilds a dev build when native code changes."
    : "  SDK checked. The first `pnpm customer --native` or `pnpm driver --native` installs that app's dev build.",
);

// ── Done ────────────────────────────────────────────────────────────────────

if (startedDb) {
  step("Stopping Supabase, which this started");
  await supabaseAsync(["stop"]);
}

if (warnings.length > 0) {
  console.log("\n⚠ Left for you:");
  for (const warning of warnings) console.log(`  - ${warning}`);
}
console.log("\n✔ Ready: `pnpm console`, `pnpm customer` or `pnpm driver`.\n");
