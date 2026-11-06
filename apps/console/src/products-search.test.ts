import { describe, expect, it } from "vitest";
import { readProductsSearch } from "./products-search.js";

describe("the Products view's search params", () => {
  it("reads the open Product and every filter", () => {
    expect(
      readProductsSearch({ product: "p-1", q: "rib", category: "c-1", unavailable: 1 }),
    ).toEqual({ product: "p-1", q: "rib", category: "c-1", unavailable: 1 });
  });

  it("reads a search that the URL parsed as a number as text", () => {
    expect(readProductsSearch({ q: 250 })).toEqual({ q: "250" });
  });

  it("drops what it does not understand, and empty values", () => {
    expect(
      readProductsSearch({ q: "", category: ["c-1"], unavailable: "yes", page: 2 }),
    ).toEqual({});
  });
});
