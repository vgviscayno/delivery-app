// @vitest-environment jsdom
import { type CourierClient, saveProduct } from "@courier/api-client";
import type { Catalog } from "@courier/domain";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createConsoleRouter } from "./router.js";
import { clearActivity, recordActivity } from "./use-idle-sign-out.js";

const catalog: Catalog = {
  products: [
    {
      id: "p-ribeye",
      name: "Ribeye",
      description: "Grain-fed, cut to order.",
      photoUrl: null,
      available: true,
      price: {
        type: "per_weight",
        pricePerKgCentavos: 85000,
        weightStepGrams: 250,
        toleranceGrams: 30,
      },
    },
    {
      id: "p-tocino",
      name: "Pork tocino",
      description: null,
      photoUrl: null,
      available: false,
      price: { type: "per_unit", unitPriceCentavos: 24500 },
    },
  ],
  categories: [{ id: "c-beef", name: "Beef", position: 1 }],
  memberships: [{ productId: "p-ribeye", categoryId: "c-beef", position: 1 }],
};

// Stubbed at the package boundary, as in router.test.tsx: the real router, shell and
// grid run, without a Supabase behind them.
vi.mock("@courier/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@courier/api-client")>()),
  resumeConsoleSession: vi.fn(async () => ({
    status: "dispatcher",
    dispatcher: { id: "d-1", email: "dispatcher@courier.local" },
  })),
  fetchServerClock: vi.fn(() => new Promise(() => {})),
  fetchDispatcherCatalog: vi.fn(async () => catalog),
  saveProduct: vi.fn(async (_client: unknown, id: string | null) => id ?? "p-new"),
  setProductAvailable: vi.fn(async () => {}),
  setCategoryProducts: vi.fn(async () => {}),
}));

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

const grid = () => screen.findByRole("table", { name: "Products" });

beforeEach(() => {
  recordActivity();
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  clearActivity();
  vi.clearAllMocks();
});

describe("the Products grid", () => {
  it("labels the price columns, and shows — where a per-unit row has no weight", async () => {
    renderAt("/catalog/products");
    const table = await grid();

    for (const header of ["Price", "Ordered in", "Weight tolerance"]) {
      // Each header starts with its label; the per-weight ones go on with a hint.
      const name = new RegExp(`^${header}(?![a-z])`);
      expect(within(table).getByRole("columnheader", { name })).toBeTruthy();
    }
    const tocino = within(table).getByRole("row", { name: /Pork tocino/ });
    expect(within(tocino).getAllByText("—")).toHaveLength(2);
    expect(within(tocino).getByText("each")).toBeTruthy();
  });

  it("restores the search and the open Product from the URL", async () => {
    renderAt("/catalog/products?q=rib&product=p-ribeye");
    const table = await grid();

    expect(within(table).queryByRole("row", { name: /Pork tocino/ })).toBeNull();
    const panel = screen.getByRole("complementary", { name: "Ribeye" });
    expect(within(panel).getByLabelText(/Description/)).toHaveProperty(
      "value",
      "Grain-fed, cut to order.",
    );
  });

  it("says so when the URL names a Product that is not in the catalog", async () => {
    const router = renderAt("/catalog/products?product=p-gone&q=rib");

    expect(await screen.findByText("That Product no longer exists.")).toBeTruthy();
    expect(router.state.location.search).toEqual({ q: "rib" });
  });

  it("asks before leaving with unsaved changes, and stays if told to", async () => {
    const router = renderAt("/catalog/products");
    await grid();

    fireEvent.change(screen.getByLabelText("Name of Ribeye"), {
      target: { value: "Rib-eye" },
    });
    fireEvent.click(screen.getByRole("link", { name: "Categories" }));

    const prompt = await screen.findByRole("alertdialog");
    fireEvent.click(within(prompt).getByRole("button", { name: "Stay" }));
    expect(router.state.location.pathname).toBe("/catalog/products");
    expect(screen.getByLabelText("Name of Ribeye")).toHaveProperty("value", "Rib-eye");
  });

  it("leaves without asking when nothing is unsaved", async () => {
    const router = renderAt("/catalog/products");
    await grid();

    fireEvent.click(screen.getByRole("link", { name: "Categories" }));

    expect(
      await screen.findByRole("heading", { level: 2, name: "Categories" }),
    ).toBeTruthy();
    expect(router.state.location.pathname).toBe("/catalog/categories");
  });

  it("writes nothing until Save, then saves each changed row", async () => {
    renderAt("/catalog/products");
    await grid();

    fireEvent.change(screen.getByLabelText("Price of Ribeye"), {
      target: { value: "900" },
    });
    expect(saveProduct).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    const ribeye = await screen.findByRole("row", { name: /Ribeye/ });
    expect(await within(ribeye).findByText("Saved")).toBeTruthy();
    expect(saveProduct).toHaveBeenCalledTimes(1);
    expect(saveProduct).toHaveBeenCalledWith(
      client,
      "p-ribeye",
      expect.objectContaining({
        price: expect.objectContaining({ pricePerKgCentavos: 90000 }),
      }),
    );
  });
});
