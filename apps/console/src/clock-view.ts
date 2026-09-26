import type { ServerClock } from "@courier/domain";

export interface ClockView {
  readonly state: "loading" | "ready" | "error";
  readonly label: string;
  readonly detail?: string;
}

export const LOADING_CLOCK: ClockView = {
  state: "loading",
  label: "Reading the shop clock…",
};

/**
 * Turns a clock read into what the console shows.
 *
 * The console never formats the Manila day itself; it repeats what the server said.
 * A dispatcher looking at this is checking the clock every time rule is judged by, so
 * "the browser's idea of now" would be worse than useless.
 */
export function describeClock(clock: ServerClock): ClockView {
  return {
    state: "ready",
    label: timeOfDay(clock.localTime),
    detail: `${clock.localDate} · ${clock.timeZone}`,
  };
}

/**
 * Turns whatever was thrown trying to read the clock into what the console shows.
 *
 * A failed read has to read as a failure rather than as a time that has quietly
 * stopped moving.
 */
export function describeClockFailure(error: unknown): ClockView {
  return {
    state: "error",
    label: "Could not reach the shop clock",
    detail: error instanceof Error ? error.message : String(error),
  };
}

/** `2026-09-26T15:30:00` → `15:30:00`. The date is shown separately. */
function timeOfDay(localTime: string): string {
  return localTime.split("T")[1] ?? localTime;
}
