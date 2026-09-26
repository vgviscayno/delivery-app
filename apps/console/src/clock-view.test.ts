import { describe, expect, it } from "vitest";
import { describeClock, describeClockFailure } from "./clock-view.js";

const clock = {
  instant: new Date("2026-09-26T07:30:00Z"),
  localTime: "2026-09-26T15:30:00",
  localDate: "2026-09-26",
  timeZone: "Asia/Manila",
};

describe("describeClock", () => {
  it("shows the server's time of day and the day it belongs to", () => {
    expect(describeClock(clock)).toEqual({
      state: "ready",
      label: "15:30:00",
      detail: "2026-09-26 · Asia/Manila",
    });
  });
});

describe("describeClockFailure", () => {
  it("shows a failure as a failure, never as a stale time", () => {
    const view = describeClockFailure(new Error("server_clock failed: network error"));

    expect(view.state).toBe("error");
    expect(view.detail).toContain("network error");
  });

  it("shows something thrown that is not an Error as a failure too", () => {
    expect(describeClockFailure("boom").state).toBe("error");
  });
});
