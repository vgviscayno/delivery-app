import { describe, expect, it, vi } from "vitest";
import { ApiError, fetchServerClock, type CourierClient } from "./index.js";

function clientReturning(response: { data: unknown; error: unknown }): CourierClient {
  return { rpc: vi.fn().mockResolvedValue(response) } as unknown as CourierClient;
}

const row = {
  instant: "2026-09-26T07:30:00+00:00",
  local_time: "2026-09-26T15:30:00",
  local_date: "2026-09-26",
  time_zone: "Asia/Manila",
};

describe("fetchServerClock", () => {
  it("returns the clock the server reported", async () => {
    const client = clientReturning({ data: [row], error: null });

    await expect(fetchServerClock(client)).resolves.toMatchObject({
      localDate: "2026-09-26",
      timeZone: "Asia/Manila",
    });
    expect(client.rpc).toHaveBeenCalledWith("server_clock");
  });

  it("names the operation when the call fails", async () => {
    const client = clientReturning({
      data: null,
      error: { message: "permission denied for function server_clock", code: "42501" },
    });

    await expect(fetchServerClock(client)).rejects.toThrow(ApiError);
    await expect(fetchServerClock(client)).rejects.toThrow(/server_clock/);
  });

  it("treats an empty result as a failure rather than a missing clock", async () => {
    const client = clientReturning({ data: [], error: null });

    await expect(fetchServerClock(client)).rejects.toThrow(/no clock/);
  });
});
