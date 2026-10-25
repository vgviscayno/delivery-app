import { describe, expect, it, vi } from "vitest";
import {
  deleteCategory,
  fetchCatalog,
  fetchDispatcherCatalog,
  reorderCategories,
  saveCategory,
  saveProduct,
  setCategoryProducts,
  setProductAvailable,
} from "./catalog.js";
import { ApiError, type CourierClient } from "./client.js";

type Response = { data: unknown; error: unknown };

const ok = (data: unknown): Response => ({ data, error: null });
const refused: Response = {
  data: null,
  error: {
    message: "only an active dispatcher may change the shop settings",
    code: "42501",
  },
};

const longganisaRow = {
  id: "p-longganisa",
  name: "Garlic longganisa, 500 g pack",
  description: "Sweet, garlicky, made in-house.",
  photo_url: null,
  price_type: "per_unit",
  unit_price_centavos: 18500,
  price_per_kg_centavos: null,
  weight_step_grams: null,
  tolerance_grams: null,
};

const ribeyeRow = {
  id: "p-ribeye",
  name: "Ribeye",
  description: null,
  photo_url: "https://example.com/ribeye.jpg",
  price_type: "per_weight",
  unit_price_centavos: null,
  price_per_kg_centavos: 120000,
  weight_step_grams: 250,
  tolerance_grams: 250,
};

const categoryRows = [
  { id: "c-grill", name: "Grilling", position: 1 },
  { id: "c-beef", name: "Beef", position: 2 },
];

const membershipRows = [
  { product_id: "p-ribeye", category_id: "c-beef", position: 1 },
  { product_id: "p-ribeye", category_id: "c-grill", position: 2 },
];

interface Fake {
  rpc?: Record<string, Response>;
  views?: Record<string, Response>;
}

/**
 * A client whose RPCs and views answer from the given responses. A view query is a
 * chain — `from(view).select(...).order(...)` — that resolves to its response.
 */
function fakeClient({ rpc = {}, views = {} }: Fake = {}) {
  const rpcFn = vi.fn((name: string) =>
    Promise.resolve(rpc[name] ?? { data: null, error: null }),
  );
  const from = vi.fn((view: string) => {
    const response = views[view] ?? ok([]);
    const query = {
      select: () => query,
      order: () => query,
      // biome-ignore lint/suspicious/noThenProperty: Supabase's query builder is awaited as a thenable.
      then: (resolve: (value: Response) => unknown) =>
        Promise.resolve(response).then(resolve),
    };
    return query;
  });
  return { client: { rpc: rpcFn, from } as unknown as CourierClient, rpc: rpcFn, from };
}

describe("fetchCatalog", () => {
  it("reads the orderable Products, the Categories and their memberships", async () => {
    const { client, from } = fakeClient({
      views: {
        catalog_products: ok([longganisaRow, ribeyeRow]),
        catalog_categories: ok(categoryRows),
        catalog_memberships: ok(membershipRows),
      },
    });

    await expect(fetchCatalog(client)).resolves.toEqual({
      products: [
        {
          id: "p-longganisa",
          name: "Garlic longganisa, 500 g pack",
          description: "Sweet, garlicky, made in-house.",
          photoUrl: null,
          available: true,
          price: { type: "per_unit", unitPriceCentavos: 18500 },
        },
        {
          id: "p-ribeye",
          name: "Ribeye",
          description: null,
          photoUrl: "https://example.com/ribeye.jpg",
          available: true,
          price: {
            type: "per_weight",
            pricePerKgCentavos: 120000,
            weightStepGrams: 250,
            toleranceGrams: 250,
          },
        },
      ],
      categories: [
        { id: "c-grill", name: "Grilling", position: 1 },
        { id: "c-beef", name: "Beef", position: 2 },
      ],
      memberships: [
        { productId: "p-ribeye", categoryId: "c-beef", position: 1 },
        { productId: "p-ribeye", categoryId: "c-grill", position: 2 },
      ],
    });
    expect(from).toHaveBeenCalledWith("catalog_products");
  });

  it("names the read that failed", async () => {
    const { client } = fakeClient({
      views: {
        catalog_categories: { data: null, error: { message: "permission denied" } },
      },
    });

    await expect(fetchCatalog(client)).rejects.toThrow(/catalog_categories/);
  });

  it("refuses a Product whose price does not match its price type", async () => {
    const { client } = fakeClient({
      views: { catalog_products: ok([{ ...ribeyeRow, weight_step_grams: null }]) },
    });

    await expect(fetchCatalog(client)).rejects.toThrow(/Ribeye/);
  });
});

describe("fetchDispatcherCatalog", () => {
  it("reads every Product the dispatcher keeps, unavailable ones included", async () => {
    const { client, rpc } = fakeClient({
      rpc: {
        dispatcher_products: ok([{ ...ribeyeRow, available: false, updated_at: "x" }]),
        dispatcher_category_products: ok(membershipRows),
      },
      views: { catalog_categories: ok(categoryRows) },
    });

    const catalog = await fetchDispatcherCatalog(client);

    expect(catalog.products).toEqual([
      expect.objectContaining({ id: "p-ribeye", available: false }),
    ]);
    expect(catalog.memberships).toHaveLength(2);
    expect(rpc).toHaveBeenCalledWith("dispatcher_products");
  });

  it("surfaces the server's refusal", async () => {
    const { client } = fakeClient({ rpc: { dispatcher_products: refused } });

    await expect(fetchDispatcherCatalog(client)).rejects.toThrow(/dispatcher_products/);
  });
});

describe("saveProduct", () => {
  const details = { name: "Ribeye", description: null, photoUrl: null };

  it("adds a per-unit Product with no weight fields", async () => {
    const { client, rpc } = fakeClient({ rpc: { save_product: ok("p-new") } });

    await expect(
      saveProduct(client, null, {
        ...details,
        name: "Tocino",
        price: { type: "per_unit", unitPriceCentavos: 16500 },
      }),
    ).resolves.toBe("p-new");

    expect(rpc).toHaveBeenCalledWith("save_product", {
      id: null,
      name: "Tocino",
      description: null,
      photo_url: null,
      price_type: "per_unit",
      unit_price_centavos: 16500,
      price_per_kg_centavos: null,
      weight_step_grams: null,
      tolerance_grams: null,
    });
  });

  it("edits a per-weight Product, sending its rate per kg as it is", async () => {
    const { client, rpc } = fakeClient({ rpc: { save_product: ok("p-ribeye") } });

    await saveProduct(client, "p-ribeye", {
      ...details,
      price: {
        type: "per_weight",
        pricePerKgCentavos: 120000,
        weightStepGrams: 250,
        toleranceGrams: 300,
      },
    });

    expect(rpc).toHaveBeenCalledWith("save_product", {
      id: "p-ribeye",
      name: "Ribeye",
      description: null,
      photo_url: null,
      price_type: "per_weight",
      unit_price_centavos: null,
      price_per_kg_centavos: 120000,
      weight_step_grams: 250,
      tolerance_grams: 300,
    });
  });

  it("surfaces the server's refusal", async () => {
    const { client } = fakeClient({ rpc: { save_product: refused } });

    await expect(
      saveProduct(client, null, {
        ...details,
        price: { type: "per_unit", unitPriceCentavos: 100 },
      }),
    ).rejects.toThrow(ApiError);
  });
});

describe("the catalog's other writes", () => {
  it.each([
    [
      "setProductAvailable",
      (client: CourierClient) => setProductAvailable(client, "p-ribeye", false),
      "set_product_available",
      { id: "p-ribeye", available: false },
    ],
    [
      "saveCategory",
      (client: CourierClient) => saveCategory(client, null, "Pork"),
      "save_category",
      { id: null, name: "Pork" },
    ],
    [
      "reorderCategories",
      (client: CourierClient) => reorderCategories(client, ["c-beef", "c-grill"]),
      "reorder_categories",
      { ids: ["c-beef", "c-grill"] },
    ],
    [
      "deleteCategory",
      (client: CourierClient) => deleteCategory(client, "c-beef"),
      "delete_category",
      { id: "c-beef" },
    ],
    [
      "setCategoryProducts",
      (client: CourierClient) => setCategoryProducts(client, "c-beef", ["p-ribeye"]),
      "set_category_products",
      { category_id: "c-beef", product_ids: ["p-ribeye"] },
    ],
  ])("%s calls %s", async (_, write, name, args) => {
    const { client, rpc } = fakeClient();

    await write(client);

    expect(rpc).toHaveBeenCalledWith(name, args);
  });

  it("names the write that was refused", async () => {
    const { client } = fakeClient({ rpc: { reorder_categories: refused } });

    await expect(reorderCategories(client, [])).rejects.toThrow(/reorder_categories/);
  });
});
