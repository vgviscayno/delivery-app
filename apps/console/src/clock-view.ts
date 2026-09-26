import type { ServerClock } from "@courier/domain";

export interface ClockView {
  readonly state: "loading" | "ready" | "error";
  readonly label: string;
  readonly detail?: string;
}

/**
 * Turns a clock read — or the failure to read one — into what the console shows.
 *
 * The console never formats the Manila day itself; it repeats what the server said.
 * A dispatcher looking at this is checking the clock every time rule is judged by,
 * so "the browser's idea of now" would be worse than useless.
 */
export function describeClock(result: ServerClock | Error): ClockView {
  if (result instanceof Error) {
    return {
      state: "error",
      label: "Could not reach the shop clock",
      detail: result.message,
    };
  }

  return {
    state: "ready",
    label: timeOfDay(result.localTime),
    detail: `${result.localDate} · ${result.timeZone}`,
  };
}

/** `2026-09-26T15:30:00` → `15:30:00`. The date is shown separately. */
function timeOfDay(localTime: string): string {
  return localTime.replace("T", " ").split(" ")[1] ?? localTime;
}
