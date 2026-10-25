import { describe, expect, it } from "vitest";
import { hasIdledOut, readIdleTimeout } from "./idle.js";

const MINUTE = 60_000;

describe("readIdleTimeout", () => {
  it("defaults to thirty minutes when nothing is configured", () => {
    expect(readIdleTimeout(undefined)).toBe(30 * MINUTE);
    expect(readIdleTimeout("")).toBe(30 * MINUTE);
  });

  it("reads a configured number of minutes", () => {
    expect(readIdleTimeout("1")).toBe(MINUTE);
    expect(readIdleTimeout("0.5")).toBe(30_000);
  });

  it("refuses a timeout that would never sign anyone out, or always would", () => {
    expect(() => readIdleTimeout("0")).toThrow(/VITE_DISPATCHER_IDLE_MINUTES/);
    expect(() => readIdleTimeout("-5")).toThrow(/VITE_DISPATCHER_IDLE_MINUTES/);
    expect(() => readIdleTimeout("thirty")).toThrow(/VITE_DISPATCHER_IDLE_MINUTES/);
  });
});

describe("hasIdledOut", () => {
  const lastActivity = Date.parse("2026-10-25T01:00:00Z");

  it("keeps a dispatcher who was active within the timeout", () => {
    expect(hasIdledOut(lastActivity, lastActivity + 30 * MINUTE - 1, 30 * MINUTE)).toBe(
      false,
    );
  });

  it("signs out a dispatcher exactly at the timeout", () => {
    expect(hasIdledOut(lastActivity, lastActivity + 30 * MINUTE, 30 * MINUTE)).toBe(true);
  });

  it("signs out a session with no recorded activity at all", () => {
    expect(hasIdledOut(null, lastActivity, 30 * MINUTE)).toBe(true);
  });
});
