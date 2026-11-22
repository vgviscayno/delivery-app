import { TIME_ZONE } from "@courier/config";

export interface DutyState {
  readonly onDuty: boolean;
  readonly onDutyChangedAt: string | null;
  readonly active?: boolean;
  readonly deactivatedAt?: string | null;
}

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
