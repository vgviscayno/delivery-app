import type { Catalog, Product } from "@courier/domain";
import { describe, expect, it } from "vitest";
import {
  addRow,
  addToCategory,
  changedFields,
  type Draft,
  draftFromCatalog,
  duplicateRow,
  editRows,
  fillDown,
  fillDownTargets,
  isDirty,
  markSaved,
  readRow,
  removeFromCategory,
  removeRows,
  syncDraft,
  visibleRows,
} from "./product-grid.js";

const ribeye: Product = {
  id: "p-ribeye",
  name: "Ribeye",
  description: "Grain-fed, cut to order.",
  photoUrl: "https://example.com/ribeye.jpg",
  available: true,
  price: {
    type: "per_weight",
    pricePerKgCentavos: 120050,
    weightStepGrams: 250,
    toleranceGrams: 100,
  },
};

const tocino: Product = {
  id: "p-tocino",
  name: "Pork tocino, 450 g pack",
  description: null,
  photoUrl: null,
  available: false,
  price: { type: "per_unit", unitPriceCentavos: 16500 },
};

const catalog: Catalog = {
  products: [ribeye, tocino],
  categories: [
    { id: "c-beef", name: "Beef", position: 1 },
    { id: "c-pork", name: "Pork", position: 2 },
  ],
  memberships: [
    { productId: "p-ribeye", categoryId: "c-beef", position: 1 },
    { productId: "p-tocino", categoryId: "c-pork", position: 1 },
  ],
};

const lastKey = (draft: Draft) => draft.rows.at(-1)?.key ?? "";

const nth = (draft: Draft, index: number) => {
  const row = draft.rows[index];
  if (!row) throw new Error(`the draft has no row ${index}`);
  return row;
};

describe("the Products grid draft", () => {
  it("has one unchanged row per Product, in pesos and grams", () => {
    const draft = draftFromCatalog(catalog);

    expect(draft.rows.map((row) => row.values)).toEqual([
      {
        name: "Ribeye",
        priceType: "per_weight",
        price: "1200.50",
        step: "250",
        tolerance: "100",
        available: true,
        categoryIds: ["c-beef"],
        description: "Grain-fed, cut to order.",
        photoUrl: "https://example.com/ribeye.jpg",
      },
      {
        name: "Pork tocino, 450 g pack",
        priceType: "per_unit",
        price: "165.00",
        step: "",
        tolerance: "250",
        available: false,
        categoryIds: ["c-pork"],
        description: "",
        photoUrl: "",
      },
    ]);
    expect(draft.rows.map((row) => changedFields(row))).toEqual([[], []]);
    expect(isDirty(draft)).toBe(false);
  });

  it("adds a blank per-unit row with the 250 g tolerance filled in and no step", () => {
    const draft = addRow(draftFromCatalog(catalog));
    const added = draft.rows[2];

    expect(added).toMatchObject({
      productId: null,
      values: { name: "", price: "", step: "", tolerance: "250", available: true },
    });
    expect(isDirty(draft)).toBe(false);
  });

  it("marks the cells that differ from what was saved", () => {
    let draft = draftFromCatalog(catalog);
    draft = editRows(draft, ["p-ribeye"], { price: "1250.00", name: "Ribeye" });
    draft = addRow(draft);
    draft = editRows(draft, [lastKey(draft)], { name: "Sirloin" });

    expect(draft.rows.map((row) => changedFields(row))).toEqual([
      ["price"],
      [],
      ["name"],
    ]);
    expect(isDirty(draft)).toBe(true);
  });

  it("ignores step and tolerance on a per-unit row", () => {
    const draft = editRows(draftFromCatalog(catalog), ["p-tocino"], { tolerance: "50" });
    expect(changedFields(nth(draft, 1))).toEqual([]);
  });

  it("duplicates a row, all but its name and photo, into a new row just below", () => {
    const draft = duplicateRow(draftFromCatalog(catalog), "p-ribeye");

    expect(draft.rows.map((row) => row.productId)).toEqual([
      "p-ribeye",
      null,
      "p-tocino",
    ]);
    expect(draft.rows[1]?.values).toEqual({
      ...draft.rows[0]?.values,
      name: "",
      photoUrl: "",
    });
  });

  it("fills a price down into other rows", () => {
    const draft = fillDown(draftFromCatalog(catalog), "price", "p-ribeye", ["p-tocino"]);
    expect(draft.rows[1]?.values.price).toBe("1200.50");
  });

  describe("which cells Ctrl+D fills", () => {
    const keys = ["a", "b", "c", "d"];

    it("fills this cell into the ticked rows below it", () => {
      expect(fillDownTargets(keys, 1, new Set(["a", "c", "d"]))).toEqual({
        from: "b",
        to: ["c", "d"],
      });
    });

    it("with none ticked below, fills this cell from the row above", () => {
      expect(fillDownTargets(keys, 2, new Set(["a"]))).toEqual({ from: "b", to: ["c"] });
    });

    it("has nothing to fill in the first row with none ticked", () => {
      expect(fillDownTargets(keys, 0, new Set())).toBeNull();
    });
  });

  it("does not fill a step or tolerance into a per-unit row, whose cells are disabled", () => {
    let draft = addRow(draftFromCatalog(catalog));
    draft = editRows(draft, [lastKey(draft)], { priceType: "per_weight" });
    draft = fillDown(draft, "step", "p-ribeye", ["p-tocino", lastKey(draft)]);

    expect(draft.rows.map((row) => row.values.step)).toEqual(["250", "", "250"]);
  });

  it("reads a row into the Product it would save", () => {
    expect(readRow(nth(draftFromCatalog(catalog), 0))).toEqual({
      ok: true,
      edits: {
        name: ribeye.name,
        description: ribeye.description,
        photoUrl: ribeye.photoUrl,
        price: ribeye.price,
      },
      warnings: {},
    });
  });

  it("puts each error on the cell it is about", () => {
    let draft = addRow(draftFromCatalog(catalog));
    draft = editRows(draft, [lastKey(draft)], {
      name: "Sirloin",
      priceType: "per_weight",
    });

    const read = readRow(nth(draft, 2));
    expect(read.ok).toBe(false);
    expect(Object.keys(read.ok ? {} : read.errors).sort()).toEqual(["price", "step"]);
  });

  it("warns on the tolerance cell when it is not less than the step, and still reads", () => {
    const draft = editRows(draftFromCatalog(catalog), ["p-ribeye"], { tolerance: "250" });
    expect(readRow(nth(draft, 0))).toMatchObject({
      ok: true,
      warnings: { tolerance: expect.stringMatching(/step/) },
    });
  });

  describe("bulk actions on ticked rows", () => {
    const ticked = ["p-ribeye", "p-tocino"];

    it("marks every ticked row unavailable, in the draft", () => {
      const draft = editRows(draftFromCatalog(catalog), ticked, { available: false });
      expect(draft.rows.map((row) => changedFields(row))).toEqual([["available"], []]);
    });

    it("adds ticked rows to a Category, once", () => {
      const draft = addToCategory(draftFromCatalog(catalog), ticked, "c-beef");
      expect(draft.rows.map((row) => row.values.categoryIds)).toEqual([
        ["c-beef"],
        ["c-pork", "c-beef"],
      ]);
    });

    it("removes ticked rows from a Category", () => {
      const draft = removeFromCategory(draftFromCatalog(catalog), ticked, "c-pork");
      expect(draft.rows.map((row) => row.values.categoryIds)).toEqual([["c-beef"], []]);
    });
  });

  it("removes rows", () => {
    const added = addRow(draftFromCatalog(catalog));
    const draft = removeRows(added, ["p-ribeye", lastKey(added)]);
    expect(draft.rows.map((row) => row.key)).toEqual(["p-tocino"]);
  });

  describe("finding rows", () => {
    const keys = (draft: Draft, filters: Parameters<typeof visibleRows>[1]) =>
      visibleRows(draft, filters).map((row) => row.key);

    it("searches names, ignoring case", () => {
      expect(keys(draftFromCatalog(catalog), { q: "TOCINO" })).toEqual(["p-tocino"]);
    });

    it("filters by Category and by unavailable", () => {
      const draft = draftFromCatalog(catalog);
      expect(keys(draft, { category: "c-beef" })).toEqual(["p-ribeye"]);
      expect(keys(draft, { unavailable: 1 })).toEqual(["p-tocino"]);
    });

    it("filters on what was saved, so a row being edited stays in view", () => {
      const draft = editRows(draftFromCatalog(catalog), ["p-tocino"], {
        available: true,
      });
      expect(keys(draft, { unavailable: 1 })).toEqual(["p-tocino"]);
    });

    it("always shows rows not yet saved", () => {
      const draft = addRow(draftFromCatalog(catalog));
      expect(keys(draft, { q: "ribeye" })).toEqual(["p-ribeye", lastKey(draft)]);
    });
  });

  describe("after the catalog is read again", () => {
    const repriced: Product = {
      ...tocino,
      price: { type: "per_unit", unitPriceCentavos: 17000 },
    };

    it("takes up the server's values on rows with no edits", () => {
      const draft = syncDraft(draftFromCatalog(catalog), {
        ...catalog,
        products: [ribeye, repriced],
      });
      expect(draft.rows[1]?.values.price).toBe("170.00");
      expect(isDirty(draft)).toBe(false);
    });

    it("keeps the cells edited and not yet saved, and takes up the rest", () => {
      const edited = editRows(draftFromCatalog(catalog), ["p-tocino"], {
        name: "Tocino",
      });
      const draft = syncDraft(edited, { ...catalog, products: [ribeye, repriced] });
      expect(draft.rows[1]?.values).toMatchObject({ name: "Tocino", price: "170.00" });
      expect(changedFields(nth(draft, 1))).toEqual(["name"]);
    });

    it("drops deleted Products and adds ones it has not seen", () => {
      const sirloin: Product = { ...ribeye, id: "p-sirloin", name: "Sirloin" };
      const draft = syncDraft(draftFromCatalog(catalog), {
        ...catalog,
        products: [ribeye, sirloin],
      });
      expect(draft.rows.map((row) => row.key)).toEqual(["p-ribeye", "p-sirloin"]);
    });

    it("keeps a newly saved row where it was, under its own key", () => {
      let draft = addRow(draftFromCatalog(catalog));
      const key = lastKey(draft);
      draft = editRows(draft, [key], { name: "Sirloin", price: "900" });
      draft = markSaved(draft, key, "p-sirloin");
      const sirloin: Product = {
        ...tocino,
        id: "p-sirloin",
        name: "Sirloin",
        available: true,
        price: { type: "per_unit", unitPriceCentavos: 90000 },
      };
      draft = syncDraft(draft, { ...catalog, products: [ribeye, sirloin, tocino] });

      expect(draft.rows.map((row) => [row.key, row.productId])).toEqual([
        ["p-ribeye", "p-ribeye"],
        ["p-tocino", "p-tocino"],
        [key, "p-sirloin"],
      ]);
      expect(draft.rows[2]?.values.price).toBe("900.00");
      expect(isDirty(draft)).toBe(false);
    });
  });
});
