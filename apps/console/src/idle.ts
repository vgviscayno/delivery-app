const MINUTE = 60_000;
const DEFAULT_IDLE_MINUTES = 30;
const VARIABLE = "VITE_DISPATCHER_IDLE_MINUTES";

export function readIdleTimeout(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_IDLE_MINUTES * MINUTE;

  const minutes = Number(raw);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    throw new Error(`${VARIABLE} must be a positive number of minutes, not "${raw}".`);
  }
  return minutes * MINUTE;
}

export function hasIdledOut(
  lastActivityAt: number | null,
  now: number,
  timeoutMs: number,
): boolean {
  if (lastActivityAt === null) return true;
  return now - lastActivityAt >= timeoutMs;
}
