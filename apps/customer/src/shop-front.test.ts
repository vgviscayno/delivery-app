import type { Catalog, Product } from "@courier/domain";
import { describe, expect, it } from "vitest";
import { shopFront } from "./shop-front";

function product(id: string, available = true): Product {
  return {
    id,
    name: id,
    description: null,
    photoPath: null,
    available,
    price: { type: "per_unit", unitPriceCentavos: 10000 },
  };
}

describe("shopFront", () => {
  it("lays out Categories in the dispatcher's order, each in its own Product order", () => {
    const catalog: Catalog = {
      products: [product("liempo"), product("ribeye"), product("tocino")],
      categories: [
        { id: "grill", name: "For the grill", position: 2 },
        { id: "pork", name: "Pork", position: 1 },
      ],
      memberships: [
        { categoryId: "grill", productId: "ribeye", position: 2 },
        { categoryId: "grill", productId: "liempo", position: 1 },
        { categoryId: "pork", productId: "liempo", position: 2 },
        { categoryId: "pork", productId: "tocino", position: 1 },
      ],
    };

    expect(
      shopFront(catalog).map((shelf) => [
        shelf.category.name,
        shelf.products.map((p) => p.id),
      ]),
    ).toEqual([
      ["Pork", ["tocino", "liempo"]],
      ["For the grill", ["liempo", "ribeye"]],
    ]);
  });

  it("keeps a sold-out Product in its place, so the grid does not reshuffle", () => {
    const catalog: Catalog = {
      products: [product("liempo", false), product("kasim")],
      categories: [{ id: "pork", name: "Pork", position: 1 }],
      memberships: [
        { categoryId: "pork", productId: "liempo", position: 1 },
        { categoryId: "pork", productId: "kasim", position: 2 },
      ],
    };

    expect(shopFront(catalog)[0]?.products.map((p) => [p.id, p.available])).toEqual([
      ["liempo", false],
      ["kasim", true],
    ]);
  });

  it("gives no tab to a Category with nothing in it", () => {
    const catalog: Catalog = {
      products: [product("ribeye")],
      categories: [
        { id: "beef", name: "Beef", position: 1 },
        { id: "lamb", name: "Lamb", position: 2 },
      ],
      memberships: [{ categoryId: "beef", productId: "ribeye", position: 1 }],
    };

    expect(shopFront(catalog).map((shelf) => shelf.category.name)).toEqual(["Beef"]);
  });
});
