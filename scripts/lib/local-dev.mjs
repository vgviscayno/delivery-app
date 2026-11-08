// What `pnpm bootstrap` and the `pnpm console | customer | driver` commands share:
// the env files each surface reads, the Docker and Android checks, and the local
// Supabase lifecycle.
//
// Only Node built-ins at the top level: bootstrap imports this before `pnpm install`
// has run, so the db tooling (which needs `pg` and the Supabase CLI) loads lazily.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));

/** The packages every app reads from `dist`, in build order. */
export const sharedPackages = ["config", "domain", "api-client"].map((name) =>
  path.join(repoRoot, "packages", name),
);

/**
 * Each surface's env file, and the keys it can't start without. `url` and `key` name
 * where the local Supabase URL and publishable key go; `mobile` apps reach the host
 * at 10.0.2.2 from the Android emulator.
 */
export const surfaces = {
  console: {
    dir: repoRoot,
    url: "VITE_SUPABASE_URL",
    key: "VITE_SUPABASE_ANON_KEY",
    mobile: false,
  },
  customer: {
    dir: path.join(repoRoot, "apps", "customer"),
    url: "EXPO_PUBLIC_SUPABASE_URL",
    key: "EXPO_PUBLIC_SUPABASE_ANON_KEY",
    mobile: true,
  },
  driver: {
    dir: path.join(repoRoot, "apps", "driver"),
    url: "EXPO_PUBLIC_SUPABASE_URL",
    key: "EXPO_PUBLIC_SUPABASE_ANON_KEY",
    mobile: true,
  },
};

export const MAPBOX_KEY = "EXPO_PUBLIC_MAPBOX_TOKEN";

export function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

export function step(message) {
  console.log(`\n▸ ${message}`);
}

export function relative(file) {
  return path.relative(repoRoot, file) || ".";
}

// ── Env files ───────────────────────────────────────────────────────────────

export function envPath(surface) {
  return path.join(surfaces[surface].dir, ".env.local");
}

export function examplePath(surface) {
  return path.join(surfaces[surface].dir, ".env.example");
}

/** `KEY="value"` lines into an object. Comments and blank lines are skipped. */
export function parseEnv(text) {
  const values = {};
  for (const line of text.split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    values[match[1]] = match[2].replace(/^(["'])(.*)\1$/, "$2");
  }
  return values;
}

export function readEnv(file) {
  return existsSync(file) ? parseEnv(readFileSync(file, "utf8")) : {};
}

/**
 * Sets each key in `updates` whose current value is empty, leaving any value someone
 * already set alone. Returns the keys it filled and the keys it kept.
 */
export function fillEnv(file, updates) {
  let text = existsSync(file) ? readFileSync(file, "utf8") : "";
  const current = parseEnv(text);
  const filled = [];
  const kept = [];
  for (const [key, value] of Object.entries(updates)) {
    if (current[key]) {
      kept.push(key);
      continue;
    }
    const line = `${key}="${value}"`;
    const pattern = new RegExp(`^\\s*${key}\\s*=.*$`, "m");
    text = pattern.test(text)
      ? text.replace(pattern, line)
      : `${text}${text.endsWith("\n") || text === "" ? "" : "\n"}${line}\n`;
    filled.push(key);
  }
  if (filled.length > 0) writeFileSync(file, text);
  return { filled, kept };
}

/** Fails, pointing at the example, unless the surface's env file has what it needs. */
export function requireEnv(surface) {
  const file = envPath(surface);
  const { url, key } = surfaces[surface];
  const fix = `Run \`pnpm bootstrap\`, or copy ${relative(examplePath(surface))} to ${relative(file)} and fill it in.`;
  if (!existsSync(file)) fail(`${relative(file)} is missing. ${fix}`);
  const values = readEnv(file);
  const missing = [url, key].filter((name) => !values[name]);
  if (missing.length > 0)
    fail(`${relative(file)} has no ${missing.join(" or ")}. ${fix}`);
}

// ── Docker ──────────────────────────────────────────────────────────────────

/** Fails unless a Docker daemon answers. Starting it is left to the human. */
export function requireDocker() {
  const result = spawnSync("docker", ["info"], { stdio: "ignore" });
  if (result.error?.code === "ENOENT") {
    fail(
      "Docker isn't installed. Install Docker Desktop or OrbStack, start it, then rerun.",
    );
  }
  if (result.status !== 0) {
    fail("Docker isn't running. Start Docker Desktop or OrbStack, then rerun.");
  }
}

// ── Supabase ────────────────────────────────────────────────────────────────

const db = () => import("../../packages/db/scripts/db.mjs");

/** The local stack's `supabase status -o env`, or null when it isn't running. */
export async function supabaseStatus() {
  const { supabase } = await db();
  const result = supabase(["status", "-o", "env"], {
    stdio: ["ignore", "pipe", "pipe"],
    allowFailure: true,
  });
  if (result.status !== 0) return null;
  const values = parseEnv(result.stdout);
  return values.API_URL ? values : null;
}

/** Runs the Supabase CLI without blocking, so signals still reach this process. */
export async function supabaseAsync(args) {
  const { supabaseArgv } = await db();
  const child = spawn(process.execPath, supabaseArgv(args), { stdio: "inherit" });
  return new Promise((resolve) => {
    child.on("exit", (code, signal) => resolve(signal ? 1 : (code ?? 1)));
  });
}

// ── Shared packages ─────────────────────────────────────────────────────────

export function tscEntry() {
  return path.join(repoRoot, "node_modules", "typescript", "bin", "tsc");
}

/** One `tsc -b` over the shared packages, so every app has their `dist`. */
export function buildSharedPackages() {
  const result = spawnSync(process.execPath, [tscEntry(), "-b", ...sharedPackages], {
    stdio: "inherit",
    cwd: repoRoot,
  });
  return result.status === 0;
}

// ── Android ─────────────────────────────────────────────────────────────────

export function androidSdk() {
  // Read directly: pnpm runs this, never turbo, so there is no task cache to key them on.
  const { ANDROID_HOME, ANDROID_SDK_ROOT } = process.env;
  const candidates = [
    ANDROID_HOME,
    ANDROID_SDK_ROOT,
    path.join(os.homedir(), "Library", "Android", "sdk"),
    path.join(os.homedir(), "Android", "Sdk"),
  ];
  return candidates.find((dir) => dir && existsSync(dir)) ?? null;
}

/** `adb` or `emulator` from the SDK, falling back to whatever is on PATH. */
export function androidTool(name) {
  const sdk = androidSdk();
  const subdir = name === "adb" ? "platform-tools" : "emulator";
  const inSdk = sdk && path.join(sdk, subdir, name);
  if (inSdk && existsSync(inSdk)) return inSdk;
  const onPath = spawnSync("which", [name], { encoding: "utf8" });
  return onPath.status === 0 ? onPath.stdout.trim() : null;
}

export function listAvds() {
  const emulator = androidTool("emulator");
  if (!emulator) return [];
  const result = spawnSync(emulator, ["-list-avds"], { encoding: "utf8" });
  return result.status === 0
    ? result.stdout
        .split("\n")
        .map((line) => line.trim())
        // The emulator prints its own INFO lines alongside the AVD names.
        .filter((line) => line && !line.includes(" ") && !line.startsWith("INFO"))
    : [];
}
