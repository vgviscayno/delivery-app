// @vitest-environment jsdom
import {
  type CourierClient,
  reorderCategories,
  setCategoryProducts,
} from "@courier/api-client";
import type { Catalog } from "@courier/domain";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createConsoleRouter } from "./router.js";
import { markTourSeen } from "./tours.js";
import { clearActivity, recordActivity } from "./use-idle-sign-out.js";

const catalog: Catalog = {
  products: [
    {
      id: "p-ribeye",
      name: "Ribeye",
      description: null,
      photoPath: null,
      available: true,
      price: { type: "per_unit", unitPriceCentavos: 50000 },
    },
    {
      id: "p-brisket",
      name: "Brisket",
      description: null,
      photoPath: null,
      available: true,
      price: { type: "per_unit", unitPriceCentavos: 40000 },
    },
  ],
  categories: [
    { id: "c-beef", name: "Beef", position: 1 },
    { id: "c-pork", name: "Pork", position: 2 },
  ],
  memberships: [
    { productId: "p-ribeye", categoryId: "c-beef", position: 1 },
    { productId: "p-brisket", categoryId: "c-beef", position: 2 },
  ],
};

// Stubbed at the package boundary, as in router.test.tsx.
vi.mock("@courier/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@courier/api-client")>()),
  resumeConsoleSession: vi.fn(async () => ({
    status: "dispatcher",
    dispatcher: { id: "d-1", email: "dispatcher@courier.local" },
  })),
  fetchServerClock: vi.fn(() => new Promise(() => {})),
  fetchDispatcherCatalog: vi.fn(async () => catalog),
  reorderCategories: vi.fn(async () => {}),
  setCategoryProducts: vi.fn(async () => {}),
}));

const client = {
  auth: {
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  },
} as unknown as CourierClient;

function renderCategories() {
  const router = createConsoleRouter({
    client,
    idleTimeoutMs: 30 * 60_000,
    history: createMemoryHistory({ initialEntries: ["/catalog/categories"] }),
  });
  render(<RouterProvider router={router} />);
}

beforeEach(() => {
  recordActivity();
  // The Catalog tours start on a first visit; catalog-tour.test.tsx covers them.
  markTourSeen("products");
  markTourSeen("categories");
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  clearActivity();
  vi.clearAllMocks();
});

describe("the Categories section", () => {
  it("gives each Category and each of its Products a named drag handle", async () => {
    renderCategories();

    for (const name of ["Drag Beef", "Drag Pork", "Drag Ribeye", "Drag Brisket"]) {
      expect(await screen.findByRole("button", { name })).toBeTruthy();
    }
  });

  it("opens the first Category, and another when it is picked", async () => {
    renderCategories();

    const beef = await screen.findByRole("button", { name: /^Beef/ });
    expect(beef.getAttribute("aria-current")).toBe("true");
    expect(screen.getByRole("textbox", { name: "Name of Beef" })).toBeTruthy();
    expect(screen.getByRole("list", { name: "Products in Beef" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^Pork/ }));

    expect(await screen.findByRole("textbox", { name: "Name of Pork" })).toBeTruthy();
    expect(screen.getByText("No Products in this Category.")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Products in Beef" })).toBeNull();
    expect(beef.getAttribute("aria-current")).toBeNull();
  });

  it("still moves Categories and Products with the ↑/↓ buttons", async () => {
    renderCategories();

    fireEvent.click(await screen.findByRole("button", { name: "Move Beef down" }));
    await waitFor(() =>
      expect(reorderCategories).toHaveBeenCalledWith(client, ["c-pork", "c-beef"]),
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Move Ribeye down in Beef" }),
    );
    await waitFor(() =>
      expect(setCategoryProducts).toHaveBeenCalledWith(client, "c-beef", [
        "p-brisket",
        "p-ribeye",
      ]),
    );
  });
});
