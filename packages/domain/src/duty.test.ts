import { describe, expect, it } from "vitest";
import { describeDuty } from "./duty.js";

// 23:30 UTC is 07:30 the next morning in Manila.
const changedAt = "2026-11-05T23:30:00+00:00";

describe("describeDuty", () => {
  it("says since when a driver has been On duty, by the shop's clock", () => {
    expect(describeDuty({ onDuty: true, onDutyChangedAt: changedAt })).toBe(
      "On duty since 07:30",
    );
  });

  it("says Off duty for a driver who is not On duty", () => {
    expect(describeDuty({ onDuty: false, onDutyChangedAt: changedAt })).toBe("Off duty");
  });

  it("says On duty without a time when the server gave none", () => {
    expect(describeDuty({ onDuty: true, onDutyChangedAt: null })).toBe("On duty");
  });

  it("says when a deactivated driver was deactivated, by the shop's calendar", () => {
    expect(
      describeDuty({
        onDuty: false,
        onDutyChangedAt: changedAt,
        active: false,
        deactivatedAt: changedAt,
      }),
    ).toBe("Deactivated 6 Nov 2026");
  });
});
