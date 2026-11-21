import type { Product } from "@courier/domain";
import { describe, expect, it } from "vitest";
import {
  amountInCart,
  cartTotal,
  changeAmount,
  EMPTY_CART,
  putLine,
  removeLine,
  startingAmount,
} from "./cart";

const tocino: Product = {
  id: "tocino",
  name: "Tocino",
  description: null,
  photoPath: null,
  available: true,
  price: { type: "per_unit", unitPriceCentavos: 18550 },
};

const ribeye: Product = {
  id: "ribeye",
  name: "Ribeye",
  description: null,
  photoPath: null,
  available: true,
  price: {
    type: "per_weight",
    pricePerKgCentavos: 115000,
    weightStepGrams: 125,
    toleranceGrams: 250,
  },
};

describe("cart", () => {
  it("totals a per-unit line as its price times its quantity, with no estimate", () => {
    const cart = putLine(EMPTY_CART, tocino, 3);

    expect(cartTotal(cart)).toEqual({ centavos: 55650, estimated: false });
  });

  it("counts a per-weight line at its estimated weight, which makes the total an estimate", () => {
    const cart = putLine(putLine(EMPTY_CART, tocino, 3), ribeye, 375);

    expect(cartTotal(cart)).toEqual({ centavos: 98775, estimated: true });
  });

  it("keeps one line per Product: putting it again sets its amount where it stands", () => {
    const cart = putLine(
      putLine(putLine(EMPTY_CART, ribeye, 375), tocino, 1),
      ribeye,
      1000,
    );

    expect(cart.map((line) => [line.productId, line.amount])).toEqual([
      ["ribeye", 1000],
      ["tocino", 1],
    ]);
    expect(amountInCart(cart, "ribeye")).toBe(1000);
    expect(amountInCart(cart, "liempo")).toBeUndefined();
  });

  it("changes a line's amount from the cart, keeping the price the customer saw", () => {
    const cart = changeAmount(putLine(EMPTY_CART, tocino, 3), "tocino", 5);

    expect(cart).toEqual([
      { productId: "tocino", name: "Tocino", price: tocino.price, amount: 5 },
    ]);
  });

  it("removes a line, and an emptied cart totals nothing and estimates nothing", () => {
    const cart = removeLine(putLine(EMPTY_CART, ribeye, 375), "ribeye");

    expect(cart).toEqual([]);
    expect(cartTotal(cart)).toEqual({ centavos: 0, estimated: false });
  });

  it("opens the sheet at the cart's amount, or else at the least the Product sells", () => {
    expect(startingAmount(tocino.price, undefined)).toBe(1);
    expect(startingAmount(tocino.price, 4)).toBe(4);
    expect(startingAmount(ribeye.price, undefined)).toBe(125);
    expect(startingAmount(ribeye.price, 375)).toBe(375);
  });

  it("moves a weight picked under an older step onto the nearest step of the new one", () => {
    const coarser = { ...ribeye.price, weightStepGrams: 250 };

    expect(startingAmount(coarser, 375)).toBe(500);
    expect(startingAmount(coarser, 125)).toBe(250);
  });
});
