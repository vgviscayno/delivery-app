import { describe, expect, it } from "vitest";
import { ServerClockError, toServerClock } from "./clock.js";

const row = {
  instant: "2026-09-26T07:30:00+00:00",
  local_time: "2026-09-26T15:30:00",
  local_date: "2026-09-26",
  time_zone: "Asia/Manila",
};

describe("toServerClock", () => {
  it("keeps the server's rendering of the Manila day rather than recomputing it", () => {
    const clock = toServerClock(row);

    expect(clock.localDate).toBe("2026-09-26");
    expect(clock.localTime).toBe("2026-09-26T15:30:00");
    expect(clock.instant.toISOString()).toBe("2026-09-26T07:30:00.000Z");
  });

  it("refuses a server that is not keeping Manila time", () => {
    expect(() => toServerClock({ ...row, time_zone: "UTC" })).toThrow(ServerClockError);
  });

  it("refuses an unreadable instant", () => {
    expect(() => toServerClock({ ...row, instant: "not a time" })).toThrow(
      ServerClockError,
    );
  });
});
