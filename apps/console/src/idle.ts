const MINUTE = 60_000;
const DEFAULT_IDLE_MINUTES = 30;
const VARIABLE = "VITE_DISPATCHER_IDLE_MINUTES";

/**
 * How long the console may sit untouched before the dispatcher is signed out, in
 * milliseconds. Read from `VITE_DISPATCHER_IDLE_MINUTES`, defaulting to 30 minutes.
 *
 * Enforced in the console rather than by Supabase Auth: Auth's inactivity timeout is a
 * Pro-plan setting, and it would apply to every account, while customers are meant to
 * stay signed in for good.
 */
export function readIdleTimeout(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_IDLE_MINUTES * MINUTE;

  const minutes = Number(raw);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    throw new Error(`${VARIABLE} must be a positive number of minutes, not "${raw}".`);
  }
  return minutes * MINUTE;
}

/**
 * Whether a console session has gone idle.
 *
 * This is elapsed time on one machine, not a shop rule, so it is judged by the
 * browser's clock: the Shop clock decides what day it is, not how long a tab sat still.
 * A session with no recorded activity is treated as idle, so a session restored from
 * storage without a trace of use is never kept on trust.
 */
export function hasIdledOut(
  lastActivityAt: number | null,
  now: number,
  timeoutMs: number,
): boolean {
  if (lastActivityAt === null) return true;
  return now - lastActivityAt >= timeoutMs;
}
