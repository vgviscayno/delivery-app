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

export function describeClock(clock: ServerClock): ClockView {
  return {
    state: "ready",
    label: timeOfDay(clock.localTime),
    detail: `${clock.localDate} · ${clock.timeZone}`,
  };
}

export function describeClockFailure(error: unknown): ClockView {
  return {
    state: "error",
    label: "Could not reach the shop clock",
    detail: error instanceof Error ? error.message : String(error),
  };
}

function timeOfDay(localTime: string): string {
  return localTime.split("T")[1] ?? localTime;
}
