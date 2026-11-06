// @vitest-environment jsdom
import type { CourierClient } from "@courier/api-client";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createConsoleRouter } from "./router.js";
import { clearActivity, recordActivity } from "./use-idle-sign-out.js";

// The console's only way out to the server. Stubbed at the package boundary, so these
// tests drive the real router, shell and sections without a Supabase behind them.
vi.mock("@courier/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@courier/api-client")>()),
  resumeConsoleSession: vi.fn(async () => ({
    status: "dispatcher",
    dispatcher: { id: "d-1", email: "dispatcher@courier.local" },
  })),
  signInToConsole: vi.fn(async () => ({
    status: "dispatcher",
    dispatcher: { id: "d-1", email: "dispatcher@courier.local" },
  })),
  signOutOfConsole: vi.fn(async () => {}),
  fetchServerClock: vi.fn(() => new Promise(() => {})),
  fetchDispatcherCatalog: vi.fn(async () => ({
    products: [],
    categories: [],
    memberships: [],
  })),
  fetchShopSettings: vi.fn(async () => ({
    sameDayCutoffBufferMinutes: 60,
    deliveryRadiusMeters: null,
    deliveryFeeCentavos: null,
    shopPhone: null,
    endOfDay: "18:00",
    darkThresholdMinutes: 10,
    timeConfirmationCutoff: null,
    qrPhImagePath: null,
    orderingWindow: [],
    closures: [],
  })),
  fetchDrivers: vi.fn(async () => []),
}));

/** Only what the console touches on the client itself; the rest goes through the stubs. */
const client = {
  auth: {
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  },
} as unknown as CourierClient;

function renderAt(path: string) {
  const router = createConsoleRouter({
    client,
    idleTimeoutMs: 30 * 60_000,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => {
  recordActivity();
  // jsdom has no layout, and the router resets scroll on every navigation.
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  clearActivity();
  vi.restoreAllMocks();
});

describe("console routes", () => {
  it("shows the Categories section at /catalog/categories", async () => {
    renderAt("/catalog/categories");

    expect(
      await screen.findByRole("heading", { level: 2, name: "Categories" }),
    ).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 2, name: "Products" })).toBeNull();
  });

  it("sends /catalog on to /catalog/products", async () => {
    const router = renderAt("/catalog");

    expect(
      await screen.findByRole("heading", { level: 2, name: "Products" }),
    ).toBeTruthy();
    expect(router.state.location.pathname).toBe("/catalog/products");
  });

  it("signs in at /settings/drivers and stays there", async () => {
    // No mark of recent use, so the stored session is not resumed.
    clearActivity();
    const router = renderAt("/settings/drivers");

    const email = await screen.findByLabelText("Email");
    expect(screen.queryByRole("heading", { level: 2, name: "Drivers" })).toBeNull();
    fireEvent.change(email, {
      target: { value: "dispatcher@courier.local" },
    });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(
      await screen.findByRole("heading", { level: 2, name: "Drivers" }),
    ).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 2, name: "Shop rules" })).toBeNull();
    expect(router.state.location.pathname).toBe("/settings/drivers");
  });

  it("sends an unknown path to /dispatch", async () => {
    const router = renderAt("/no/such/place");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Dispatch" }),
    ).toBeTruthy();
    expect(router.state.location.pathname).toBe("/dispatch");
  });
});
