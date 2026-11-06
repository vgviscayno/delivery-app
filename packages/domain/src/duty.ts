import { TIME_ZONE } from "@courier/config";

/** What a screen needs to say where a driver stands with being On duty. */
export interface DutyState {
  readonly onDuty: boolean;
  /** When `onDuty` last changed, by the server clock. Null if never On duty. */
  readonly onDutyChangedAt: string | null;
  /** Absent means active: the driver app only ever sees an active driver. */
  readonly active?: boolean;
  readonly deactivatedAt?: string | null;
}

/**
 * "On duty since 07:30", "Off duty" or "Deactivated 6 Nov 2026". Times and dates are
 * the shop's, whatever time zone the phone or browser is in.
 */
export function describeDuty(driver: DutyState): string {
  if (driver.active === false) {
    return driver.deactivatedAt
      ? `Deactivated ${shopDate(driver.deactivatedAt)}`
      : "Deactivated";
  }
  if (!driver.onDuty) return "Off duty";
  return driver.onDutyChangedAt
    ? `On duty since ${shopTime(driver.onDutyChangedAt)}`
    : "On duty";
}

function shopTime(instant: string): string {
  return new Date(instant).toLocaleTimeString("en-GB", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  });
}

function shopDate(instant: string): string {
  return new Date(instant).toLocaleDateString("en-GB", {
    timeZone: TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
