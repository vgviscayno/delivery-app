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
 * Turns a clock read — or whatever was thrown trying — into what the console shows.
 *
 * The console never formats the Manila day itself; it repeats what the server said.
 * A dispatcher looking at this is checking the clock every time rule is judged by,
 * so "the browser's idea of now" would be worse than useless — and a failed read has
 * to read as a failure rather than as a time that has quietly stopped moving.
 */
export function describeClock(result: ServerClock | unknown): ClockView {
  if (!isServerClock(result)) {
    return {
      state: "error",
      label: "Could not reach the shop clock",
      detail: result instanceof Error ? result.message : String(result),
    };
  }

  return {
    state: "ready",
    label: timeOfDay(result.localTime),
    detail: `${result.localDate} · ${result.timeZone}`,
  };
}

function isServerClock(result: unknown): result is ServerClock {
  return (
    typeof result === "object" &&
    result !== null &&
    "localTime" in result &&
    "localDate" in result &&
    "timeZone" in result
  );
}

/** `2026-09-26T15:30:00` → `15:30:00`. The date is shown separately. */
function timeOfDay(localTime: string): string {
  return localTime.replace("T", " ").split(" ")[1] ?? localTime;
}
