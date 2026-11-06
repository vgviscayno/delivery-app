import { describe, expect, it, vi } from "vitest";
import type { CourierClient } from "./client.js";
import { deactivateDriver, fetchDrivers, inviteDriver } from "./drivers.js";

const ANA = "d1500000-0000-4000-8000-000000000101";

function fakeClient({
  rpc = { data: null, error: null },
  invoke = { data: { id: ANA }, error: null },
}: {
  rpc?: { data: unknown; error: unknown };
  invoke?: { data: unknown; error: unknown };
}) {
  const call = vi.fn().mockResolvedValue(rpc);
  const functions = { invoke: vi.fn().mockResolvedValue(invoke) };
  return {
    client: { rpc: call, functions } as unknown as CourierClient,
    rpc: call,
    functions,
  };
}

describe("fetchDrivers", () => {
  it("lists drivers with their On duty state", async () => {
    const { client, rpc } = fakeClient({
      rpc: {
        data: [
          {
            id: ANA,
            email: "ana@shop.ph",
            name: "Ana Reyes",
            active: true,
            deactivated_at: null,
            on_duty: true,
            on_duty_changed_at: "2026-11-06T07:55:00+08:00",
          },
        ],
        error: null,
      },
    });

    await expect(fetchDrivers(client)).resolves.toEqual([
      {
        id: ANA,
        email: "ana@shop.ph",
        name: "Ana Reyes",
        active: true,
        deactivatedAt: null,
        onDuty: true,
        onDutyChangedAt: "2026-11-06T07:55:00+08:00",
      },
    ]);
    expect(rpc).toHaveBeenCalledWith("dispatcher_drivers");
  });
});

describe("inviteDriver", () => {
  it("asks the invite-driver function to provision them", async () => {
    const { client, functions } = fakeClient({});

    await expect(
      inviteDriver(client, { email: "ana@shop.ph", name: "Ana Reyes" }),
    ).resolves.toEqual({ id: ANA });
    expect(functions.invoke).toHaveBeenCalledWith("invite-driver", {
      body: { email: "ana@shop.ph", name: "Ana Reyes" },
    });
  });

  it("reports the function's own reason when it refuses", async () => {
    const response = new Response(
      JSON.stringify({ error: "an account with that email already exists" }),
      { status: 409 },
    );
    const { client } = fakeClient({
      invoke: {
        data: null,
        error: {
          message: "Edge Function returned a non-2xx status code",
          context: response,
        },
      },
    });

    await expect(
      inviteDriver(client, { email: "ana@shop.ph", name: "Ana Reyes" }),
    ).rejects.toThrow("invite-driver failed: an account with that email already exists");
  });
});

describe("deactivateDriver", () => {
  it("deactivates the driver by id", async () => {
    const { client, rpc } = fakeClient({});

    await deactivateDriver(client, ANA);

    expect(rpc).toHaveBeenCalledWith("deactivate_driver", { driver_id: ANA });
  });

  it("throws when the server refuses", async () => {
    const { client } = fakeClient({
      rpc: { data: null, error: { message: "no driver", code: "P0002" } },
    });

    await expect(deactivateDriver(client, ANA)).rejects.toThrow(/deactivate_driver/);
  });
});
