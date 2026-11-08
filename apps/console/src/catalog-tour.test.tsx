// @vitest-environment jsdom
import {
  type CourierClient,
  reorderCategories,
  saveProduct,
  setCategoryProducts,
} from "@courier/api-client";
import type { Catalog } from "@courier/domain";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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
      photoUrl: null,
      available: true,
      price: {
        type: "per_weight",
        pricePerKgCentavos: 85000,
        weightStepGrams: 250,
        toleranceGrams: 30,
      },
    },
  ],
  categories: [{ id: "c-beef", name: "Beef", position: 1 }],
  memberships: [{ productId: "p-ribeye", categoryId: "c-beef", position: 1 }],
};

// Stubbed at the package boundary, as in router.test.tsx: the real router, sections and
// driver.js run, without a Supabase behind them.
vi.mock("@courier/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@courier/api-client")>()),
  resumeConsoleSession: vi.fn(async () => ({
    status: "dispatcher",
    dispatcher: { id: "d-1", email: "dispatcher@courier.local" },
  })),
  fetchServerClock: vi.fn(() => new Promise(() => {})),
  fetchDispatcherCatalog: vi.fn(async () => catalog),
  saveProduct: vi.fn(async () => "p-new"),
  deleteProduct: vi.fn(async () => {}),
  setProductAvailable: vi.fn(async () => {}),
  setCategoryProducts: vi.fn(async () => {}),
  reorderCategories: vi.fn(async () => {}),
  saveCategory: vi.fn(async () => "c-new"),
  deleteCategory: vi.fn(async () => {}),
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

/** The tour's popover, once it shows the step with this title. */
const step = (title: string) => screen.findByRole("dialog", { name: title });
const noTour = () => expect(screen.queryByRole("dialog")).toBeNull();
const pressEscape = () => fireEvent.keyUp(window, { key: "Escape" });
/** driver.js ignores keys until a step has finished arriving, one frame without motion. */
const frame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const press = async (key: "ArrowRight" | "ArrowLeft") => {
  await frame();
  fireEvent.keyUp(window, { key });
};
const next = () =>
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: /Next|Done/ }),
  );

beforeEach(() => {
  localStorage.clear();
  recordActivity();
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  // The tour moves without animating for those who ask for less motion, as tests do.
  window.matchMedia = vi.fn(
    (query: string) => ({ matches: query.includes("reduce") }) as MediaQueryList,
  );
});

afterEach(() => {
  cleanup();
  clearActivity();
  vi.clearAllMocks();
});

describe("the Products tour", () => {
  it("starts on the first visit, and not again once closed", async () => {
    renderAt("/catalog/products");
    await step("Add row");

    pressEscape();
    await waitFor(noTour);

    cleanup();
    renderAt("/catalog/products");
    await screen.findByRole("table", { name: "Products" });
    noTour();
  });

  it("demonstrates on a draft row of its own, and discards it when closed", async () => {
    renderAt("/catalog/products");
    await step("Add row");
    const table = screen.getByRole("table", { name: "Products" });
    expect(within(table).getByRole("row", { name: "Sample Product" })).toBeTruthy();
    // The tour's row is no edit of the dispatcher's: there is nothing to Save.
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty("disabled", true);

    pressEscape();
    await waitFor(noTour);
    expect(within(table).queryByRole("row", { name: "Sample Product" })).toBeNull();
    expect(within(table).getAllByRole("row")).toHaveLength(2);
    expect(saveProduct).not.toHaveBeenCalled();
  });

  it("goes through by keyboard, opening Details on its own row, and ends with Done", async () => {
    renderAt("/catalog/products");
    await step("Add row");
    for (const title of [
      "One row, one Product",
      "Price",
      "Ordered in",
      "Weight tolerance",
      "Fill down",
      "Changes are highlighted",
      "Save",
      "Tick rows",
      "Change ticked rows",
    ]) {
      await press("ArrowRight");
      await step(title);
    }
    await press("ArrowRight");
    await step("Details");
    expect(screen.getByRole("complementary", { name: "Sample Product" })).toBeTruthy();

    // Back closes the panel the step opened.
    await press("ArrowLeft");
    await step("Change ticked rows");
    expect(screen.queryByRole("complementary")).toBeNull();
    await press("ArrowRight");
    await step("Details");

    next();
    await waitFor(noTour);
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(screen.queryByRole("row", { name: "Sample Product" })).toBeNull();

    cleanup();
    renderAt("/catalog/products");
    await screen.findByRole("table", { name: "Products" });
    noTour();
  });

  it("leaves the dispatcher's own open Product as it was, after Details and Esc", async () => {
    markTourSeen("products");
    renderAt("/catalog/products?product=p-ribeye");
    await screen.findByRole("complementary", { name: "Ribeye" });
    fireEvent.click(screen.getByRole("button", { name: "Show me around" }));
    await step("Add row");
    for (let i = 0; i < 10; i++) await press("ArrowRight");
    await step("Details");
    await screen.findByRole("complementary", { name: "Sample Product" });

    // Esc as the keyboard sends it: down where focus is, then up.
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    pressEscape();
    await waitFor(noTour);
    expect(screen.getByRole("complementary", { name: "Ribeye" })).toBeTruthy();
  });

  it("replays from Show me around, after it has been seen", async () => {
    markTourSeen("products");
    renderAt("/catalog/products");
    await screen.findByRole("table", { name: "Products" });
    noTour();

    fireEvent.click(screen.getByRole("button", { name: "Show me around" }));
    await step("Add row");
    expect(screen.getByRole("row", { name: "Sample Product" })).toBeTruthy();
  });
});

describe("the Categories tour", () => {
  it("starts on the first visit, points at each part in turn, and touches nothing", async () => {
    renderAt("/catalog/categories");
    await step("Categories");
    for (const title of [
      "Drag to reorder",
      "Or move it one place",
      "Products in a Category",
    ]) {
      await press("ArrowRight");
      await step(title);
    }
    next();
    await waitFor(noTour);
    expect(reorderCategories).not.toHaveBeenCalled();
    expect(setCategoryProducts).not.toHaveBeenCalled();

    cleanup();
    renderAt("/catalog/categories");
    await screen.findByRole("list", { name: "Categories" });
    noTour();
  });

  it("replays from Show me around, after it has been seen", async () => {
    markTourSeen("categories");
    renderAt("/catalog/categories");
    await screen.findByRole("list", { name: "Categories" });
    noTour();

    fireEvent.click(screen.getByRole("button", { name: "Show me around" }));
    await step("Categories");
  });
});
