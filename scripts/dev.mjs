// One command per app for local development, with everything it needs started first.
//
//   pnpm console [--reset]
//   pnpm customer [--reset] [--native]
//   pnpm driver [--reset] [--native]
//
// In order: check Docker and the app's .env.local; start local Supabase unless it's up;
// apply new migrations (`--reset` wipes and reseeds instead); build the shared packages
// and keep `tsc --watch` rebuilding them; for a mobile app, boot an emulator if none is
// connected; then run the app -- Vite, or Metro (`--native` rebuilds and reinstalls the
// dev build first, for when native code or app.config.ts changed).
//
// When the app exits, or on Ctrl+C, the watcher stops, and Supabase stops too if this
// command started it: a second command sharing the stack leaves it to the one that owns
// it. A second Ctrl+C while Supabase stops leaves it running. Docker and the emulator
// always stay up.

import { spawn, spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import {
  androidTool,
  fail,
  listAvds,
  relative,
  repoRoot,
  requireDocker,
  requireEnv,
  sharedPackages,
  step,
  supabaseAsync,
  supabaseStatus,
  surfaces,
  tscEntry,
} from "./lib/local-dev.mjs";

const [app, ...flags] = process.argv.slice(2);
const usage = "Usage: pnpm console | customer | driver [--reset] [--native]";

if (!surfaces[app]) fail(usage);
const known = surfaces[app].mobile ? ["--reset", "--native"] : ["--reset"];
const unknown = flags.filter((flag) => !known.includes(flag));
if (unknown.length > 0) fail(`${unknown.join(" ")} isn't an option for ${app}. ${usage}`);
const reset = flags.includes("--reset");
const native = flags.includes("--native");

// ── Shutdown ────────────────────────────────────────────────────────────────

let startedDb = false;
let watcher = null;
let appProcess = null;
let phase = "starting"; // then "running", "stopping", "stopping-db"

function exited(child) {
  return child.exitCode !== null || child.signalCode !== null;
}

function waitForExit(child, ms) {
  if (exited(child)) return Promise.resolve();
  return Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    sleep(ms).then(() => {
      if (!exited(child)) child.kill("SIGKILL");
    }),
  ]);
}

async function shutdown(code) {
  if (phase === "stopping" || phase === "stopping-db") return;
  phase = "stopping";
  for (const child of [appProcess, watcher]) {
    if (child && !exited(child)) {
      child.kill("SIGTERM");
      await waitForExit(child, 5000);
    }
  }
  if (startedDb) {
    phase = "stopping-db";
    console.log("\n▸ Stopping Supabase (Ctrl+C again to leave it running)");
    await supabaseAsync(["stop"]);
  }
  process.exit(code);
}

// Ctrl+C reaches every process in the terminal's group, so the app and the watcher get
// it directly; this only decides what happens to Supabase afterwards.
function onSignal(signal) {
  if (phase === "stopping-db") {
    console.log("\nLeft Supabase running. `pnpm db:stop` stops it.");
    process.exit(130);
  }
  shutdown(signal === "SIGINT" ? 130 : 143);
}
process.on("SIGINT", onSignal);
process.on("SIGTERM", onSignal);
process.on("SIGHUP", onSignal);

/** Like `fail`, but stops what this command started first. */
async function abort(message) {
  console.error(`\n✖ ${message}\n`);
  await shutdown(1);
  await halt();
}

/** Once shutdown has begun, the startup sequence goes no further: it ends the process. */
function halt() {
  return new Promise(() => {});
}

async function next(message) {
  if (phase !== "starting") await halt();
  step(message);
}

/** Runs a command without blocking, so a Ctrl+C is handled the moment it arrives. */
function run(file, args) {
  const child = spawn(file, args, { cwd: repoRoot, stdio: "inherit" });
  return new Promise((resolve) => {
    child.on("exit", (code, signal) => resolve(signal ? 1 : (code ?? 1)));
  });
}

// ── Checks ──────────────────────────────────────────────────────────────────

requireDocker();
requireEnv(app);

// ── Supabase ────────────────────────────────────────────────────────────────

await next("Supabase");
if (await supabaseStatus()) {
  console.log("  Already running, so it stays running when this exits.");
} else {
  startedDb = true;
  if ((await supabaseAsync(["start"])) !== 0) await abort("Supabase didn't start.");
}

if (reset) {
  await next("Resetting the database (migrations and seed)");
  if ((await supabaseAsync(["db", "reset"])) !== 0) await abort("The reset failed.");
} else {
  await next("Applying new migrations");
  if ((await supabaseAsync(["migration", "up", "--local"])) !== 0) {
    await abort(`A migration failed. \`pnpm ${app} --reset\` rebuilds from scratch.`);
  }
}
console.log(
  "  Writing a migration? `pnpm db:reset && pnpm db:types` applies it and regenerates the types.",
);

// ── Shared packages ─────────────────────────────────────────────────────────

await next("Building the shared packages");
if ((await run(process.execPath, [tscEntry(), "-b", ...sharedPackages])) !== 0) {
  await abort("The shared packages don't build.");
}

// Rebuilds `dist` as the packages change, so Vite and Metro reload. Silent while the
// build is clean; errors come through prefixed, between the app's own output.
watcher = spawn(
  process.execPath,
  [tscEntry(), "-b", "--watch", "--preserveWatchOutput", ...sharedPackages],
  { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"] },
);
const quiet = /Starting compilation|File change detected|Found 0 errors|^\s*$/;
let partial = "";
function relay(chunk) {
  const lines = (partial + chunk).split("\n");
  partial = lines.pop();
  for (const line of lines) {
    if (!quiet.test(line)) console.log(`[packages] ${line}`);
  }
}
watcher.stdout.setEncoding("utf8").on("data", relay);
watcher.stderr.setEncoding("utf8").on("data", relay);

// ── Emulator ────────────────────────────────────────────────────────────────

function connectedDevices(adb) {
  const result = spawnSync(adb, ["devices"], { encoding: "utf8" });
  return result.stdout
    .split("\n")
    .slice(1)
    .filter((line) => /\tdevice$/.test(line));
}

async function ensureEmulator() {
  const adb = androidTool("adb");
  if (!adb) await abort("adb isn't installed. Install the Android SDK platform-tools.");
  if (connectedDevices(adb).length > 0) return;

  const avds = listAvds();
  if (avds.length === 0) {
    await abort(
      "No device is connected and there's no emulator to boot. Create an AVD in Android Studio.",
    );
  }
  await next(`Booting the ${avds[0]} emulator`);
  // Its own process group, so Ctrl+C here doesn't take it down: booting is the slow part.
  spawn(androidTool("emulator"), ["-avd", avds[0]], {
    detached: true,
    stdio: "ignore",
  }).unref();

  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (phase !== "starting") return;
    const booted = spawnSync(adb, ["shell", "getprop", "sys.boot_completed"], {
      encoding: "utf8",
    });
    if (booted.stdout?.trim() === "1") return;
    await sleep(2000);
  }
  await abort("The emulator didn't finish booting within 3 minutes.");
}

if (surfaces[app].mobile) await ensureEmulator();

// ── App ─────────────────────────────────────────────────────────────────────

const pkg = `@courier/${app}`;
const command = !surfaces[app].mobile
  ? ["vite"]
  : native
    ? ["expo", "run:android"]
    : ["expo", "start", "--dev-client", "--android"];

await next(`Starting ${app} (${command.join(" ")}) in ${relative(surfaces[app].dir)}`);
if (surfaces[app].mobile && !native) {
  console.log(
    `  No dev build on the device yet, or native code changed? \`pnpm ${app} --native\``,
  );
}
phase = "running";
// Metro takes the terminal raw for its keys (r reloads, a opens Android), so the app gets
// the TTY as it is; a Ctrl+C typed into Metro ends Metro, which ends this.
appProcess = spawn("pnpm", ["--filter", pkg, "exec", ...command], {
  cwd: repoRoot,
  stdio: "inherit",
});
appProcess.on("exit", (code, signal) => shutdown(signal ? 130 : (code ?? 1)));
