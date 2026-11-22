import type { AsyncStorage } from "@courier/api-client";
import type { Product } from "@courier/domain";
import { describe, expect, it } from "vitest";
import { EMPTY_CART, putLine } from "./cart";
import { createCartStore } from "./cart-store";

function memoryStorage(): AsyncStorage & { readonly values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => {
      values.set(key, value);
    },
    removeItem: async (key) => {
      values.delete(key);
    },
  };
}

const liempo: Product = {
  id: "liempo",
  name: "Liempo",
  description: null,
  photoPath: null,
  available: true,
  price: {
    type: "per_weight",
    pricePerKgCentavos: 42000,
    weightStepGrams: 250,
    toleranceGrams: 250,
  },
};

const cart = putLine(EMPTY_CART, liempo, 750);

describe("cart store", () => {
  it("gives a customer back their cart after a relaunch", async () => {
    const phone = memoryStorage();
    await createCartStore(phone).save("ana", cart);

    expect(await createCartStore(phone).load("ana")).toEqual(cart);
  });

  it("never shows one customer's cart to another who signs in on the same phone", async () => {
    const phone = memoryStorage();
    await createCartStore(phone).save("ana", cart);

    expect(await createCartStore(phone).load("ben")).toEqual([]);
  });

  it("clears the cart on sign-out, without needing to know whose it was", async () => {
    const phone = memoryStorage();
    await createCartStore(phone).save("ana", cart);
    await createCartStore(phone).clear();

    expect(await createCartStore(phone).load("ana")).toEqual([]);
  });

  it.each([
    ["not JSON", '{"owner":"ana","li'],
    ["no lines", JSON.stringify({ owner: "ana" })],
    [
      "a line it cannot price",
      JSON.stringify({
        owner: "ana",
        lines: [{ productId: "x", name: "X", price: { type: "per_dozen" }, amount: 1 }],
      }),
    ],
    [
      "a quantity that is not a whole positive number",
      JSON.stringify({
        owner: "ana",
        lines: [
          {
            productId: "x",
            name: "X",
            price: { type: "per_unit", unitPriceCentavos: 100 },
            amount: 0.5,
          },
        ],
      }),
    ],
  ])("starts an empty cart rather than trusting a saved one with %s", async (_, raw) => {
    const phone = memoryStorage();
    phone.values.set("cart", raw);

    expect(await createCartStore(phone).load("ana")).toEqual([]);
  });
});
