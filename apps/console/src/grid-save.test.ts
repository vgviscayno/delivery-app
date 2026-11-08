import type { Catalog, Product, ProductEdits } from "@courier/domain";
import { describe, expect, it } from "vitest";
import { applyResults, type GridWrites, saveDraft } from "./grid-save.js";
import {
  addRow,
  changedFields,
  type Draft,
  draftFromCatalog,
  editRows,
  isDirty,
  type RowPhoto,
  syncDraft,
} from "./product-grid.js";

const ribeye: Product = {
  id: "p-ribeye",
  name: "Ribeye",
  description: null,
  photoPath: null,
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
  name: "Pork tocino",
  description: null,
  photoPath: null,
  available: true,
  price: { type: "per_unit", unitPriceCentavos: 16500 },
};

const longganisa: Product = { ...tocino, id: "p-longganisa", name: "Longganisa" };

const catalog: Catalog = {
  products: [ribeye, tocino, longganisa],
  categories: [
    { id: "c-beef", name: "Beef", position: 1 },
    { id: "c-pork", name: "Pork", position: 2 },
  ],
  memberships: [
    { productId: "p-ribeye", categoryId: "c-beef", position: 1 },
    { productId: "p-longganisa", categoryId: "c-pork", position: 1 },
    { productId: "p-tocino", categoryId: "c-pork", position: 2 },
  ],
};

/** Records every write, and answers like the server. */
function fakeWrites(
  fail: { saveProduct?: string; uploadPhoto?: boolean; removePhoto?: boolean } = {},
) {
  const calls: unknown[][] = [];
  const edits: ProductEdits[] = [];
  let created = 0;
  let uploaded = 0;
  const writes: GridWrites = {
    async saveProduct(id, productEdits) {
      calls.push(["saveProduct", id, productEdits.name]);
      edits.push(productEdits);
      if (fail.saveProduct === productEdits.name) throw new Error("the server refused");
      created += 1;
      return id ?? `p-new-${created}`;
    },
    async uploadPhoto(file) {
      calls.push(["uploadPhoto", file.name]);
      if (fail.uploadPhoto) throw new Error("the upload failed");
      uploaded += 1;
      return `upload-${uploaded}/large.webp`;
    },
    async removePhoto(path) {
      calls.push(["removePhoto", path]);
      if (fail.removePhoto) throw new Error("the removal failed");
    },
    async setProductAvailable(id, available) {
      calls.push(["setProductAvailable", id, available]);
    },
    async setCategoryProducts(categoryId, productIds) {
      calls.push(["setCategoryProducts", categoryId, [...productIds]]);
    },
  };
  return { writes, calls, edits };
}

const lastKey = (draft: Draft) => draft.rows.at(-1)?.key ?? "";

describe("saving the Products grid", () => {
  it("writes each valid changed row, and leaves invalid ones in the draft", async () => {
    let draft = draftFromCatalog(catalog);
    draft = editRows(draft, ["p-ribeye"], { price: "1250" });
    draft = editRows(draft, ["p-tocino"], { price: "" });
    const { writes, calls } = fakeWrites();

    const results = await saveDraft(draft, catalog, writes);

    expect(calls).toEqual([["saveProduct", "p-ribeye", "Ribeye"]]);
    expect(results.get("p-ribeye")).toEqual({ status: "saved", productId: "p-ribeye" });
    expect(results.get("p-tocino")).toEqual({
      status: "invalid",
      errors: { price: expect.any(String) },
    });
    expect(results.has("p-longganisa")).toBe(false);
  });

  it("switches availability without saving the Product's other fields", async () => {
    const draft = editRows(draftFromCatalog(catalog), ["p-tocino"], { available: false });
    const { writes, calls } = fakeWrites();

    await saveDraft(draft, catalog, writes);

    expect(calls).toEqual([["setProductAvailable", "p-tocino", false]]);
  });

  it("adds a new row, then switches it off if it was entered unavailable", async () => {
    let draft = addRow(draftFromCatalog(catalog));
    draft = editRows(draft, [lastKey(draft)], {
      name: "Chorizo",
      price: "220",
      available: false,
    });
    const { writes, calls } = fakeWrites();

    const results = await saveDraft(draft, catalog, writes);

    expect(calls).toEqual([
      ["saveProduct", null, "Chorizo"],
      ["setProductAvailable", "p-new-1", false],
    ]);
    expect(results.get(lastKey(draft))).toEqual({
      status: "saved",
      productId: "p-new-1",
    });
  });

  it("writes each touched Category once, putting Products newly added last", async () => {
    let draft = draftFromCatalog(catalog);
    draft = editRows(draft, ["p-ribeye"], { categoryIds: ["c-beef", "c-pork"] });
    draft = editRows(draft, ["p-longganisa"], { categoryIds: [] });
    draft = addRow(draft);
    draft = editRows(draft, [lastKey(draft)], {
      name: "Chorizo",
      price: "220",
      categoryIds: ["c-pork"],
    });
    const { writes, calls } = fakeWrites();

    await saveDraft(draft, catalog, writes);

    expect(calls.filter(([write]) => write === "setCategoryProducts")).toEqual([
      ["setCategoryProducts", "c-pork", ["p-tocino", "p-ribeye", "p-new-1"]],
    ]);
  });

  it("reports a row the server refused, and writes nothing more for it", async () => {
    let draft = addRow(draftFromCatalog(catalog));
    draft = editRows(draft, [lastKey(draft)], {
      name: "Chorizo",
      price: "220",
      categoryIds: ["c-pork"],
    });
    draft = editRows(draft, ["p-ribeye"], { name: "Rib-eye" });
    const { writes, calls } = fakeWrites({ saveProduct: "Chorizo" });

    const results = await saveDraft(draft, catalog, writes);

    expect(results.get(lastKey(draft))).toEqual({
      status: "failed",
      productId: null,
      message: "the server refused",
    });
    expect(results.get("p-ribeye")).toMatchObject({ status: "saved" });
    expect(calls.some(([write]) => write === "setCategoryProducts")).toBe(false);
  });

  it("tells a row whose Category write failed apart from one that was not saved", async () => {
    let draft = draftFromCatalog(catalog);
    draft = editRows(draft, ["p-ribeye"], { name: "Rib-eye", categoryIds: ["c-pork"] });
    const { writes } = fakeWrites();
    writes.setCategoryProducts = async () => {
      throw new Error("no such Category");
    };

    const results = await saveDraft(draft, catalog, writes);
    expect(results.get("p-ribeye")).toEqual({
      status: "categoriesFailed",
      productId: "p-ribeye",
      message: "no such Category",
    });
    const ribeye = applyResults(draft, results).rows[0];
    expect(ribeye && changedFields(ribeye)).toEqual(["categoryIds"]);
  });

  describe("the draft after Save", () => {
    it("has no edits left on the rows that were saved", async () => {
      let draft = draftFromCatalog(catalog);
      draft = editRows(draft, ["p-ribeye"], { price: "1250" });
      draft = editRows(draft, ["p-tocino"], { price: "" });
      const { writes } = fakeWrites();

      draft = applyResults(draft, await saveDraft(draft, catalog, writes));

      expect(draft.rows.map((row) => changedFields(row))).toEqual([[], ["price"], []]);
    });

    it("retries only the Category write of a new Product, so it is not added twice", async () => {
      let draft = addRow(draftFromCatalog(catalog));
      draft = editRows(draft, [lastKey(draft)], {
        name: "Chorizo",
        price: "220",
        categoryIds: ["c-pork"],
      });
      const { writes } = fakeWrites();
      writes.setCategoryProducts = async () => {
        throw new Error("no such Category");
      };

      draft = applyResults(draft, await saveDraft(draft, catalog, writes));
      expect(isDirty(draft)).toBe(true);
      const retry = fakeWrites();
      await saveDraft(draft, catalog, retry.writes);

      expect(retry.calls).toEqual([
        ["setCategoryProducts", "c-pork", ["p-longganisa", "p-tocino", "p-new-1"]],
      ]);
    });
  });

  describe("photos", () => {
    const withPhoto: Catalog = {
      ...catalog,
      products: [{ ...ribeye, photoPath: "old/large.webp" }, tocino, longganisa],
    };
    const dropped = (name: string): RowPhoto => ({
      file: new File(["jpeg"], name, { type: "image/jpeg" }),
      preview: `blob:${name}`,
    });

    it("uploads a dropped photo only on Save, and saves the Product against it", async () => {
      const draft = editRows(draftFromCatalog(catalog), ["p-tocino"], {
        photo: dropped("tocino.jpg"),
      });
      const { writes, calls, edits } = fakeWrites();

      const results = await saveDraft(draft, catalog, writes);

      expect(calls).toEqual([
        ["uploadPhoto", "tocino.jpg"],
        ["saveProduct", "p-tocino", "Pork tocino"],
      ]);
      expect(edits[0]?.photoPath).toBe("upload-1/large.webp");
      expect(results.get("p-tocino")).toMatchObject({ status: "saved" });
    });

    it("removes the photo it replaced once the Product points at the new one", async () => {
      const draft = editRows(draftFromCatalog(withPhoto), ["p-ribeye"], {
        photo: dropped("ribeye.jpg"),
      });
      const { writes, calls } = fakeWrites();

      await saveDraft(draft, withPhoto, writes);

      expect(calls).toEqual([
        ["uploadPhoto", "ribeye.jpg"],
        ["saveProduct", "p-ribeye", "Ribeye"],
        ["removePhoto", "old/large.webp"],
      ]);
    });

    it("removes a photo taken off a Product after the save", async () => {
      const draft = editRows(draftFromCatalog(withPhoto), ["p-ribeye"], { photo: null });
      const { writes, calls, edits } = fakeWrites();

      await saveDraft(draft, withPhoto, writes);

      expect(calls).toEqual([
        ["saveProduct", "p-ribeye", "Ribeye"],
        ["removePhoto", "old/large.webp"],
      ]);
      expect(edits[0]?.photoPath).toBeNull();
    });

    // The save may have reached the server with only the answer lost, so even the new
    // upload might be what the Product now points at. An orphan is the safe outcome.
    it("on a failed save, deletes nothing, not even its own upload", async () => {
      let draft = draftFromCatalog(withPhoto);
      draft = editRows(draft, ["p-ribeye"], {
        name: "Rib-eye",
        photo: dropped("ribeye.jpg"),
      });
      const { writes, calls } = fakeWrites({ saveProduct: "Rib-eye" });

      const results = await saveDraft(draft, withPhoto, writes);

      expect(results.get("p-ribeye")).toMatchObject({ status: "failed" });
      expect(calls.filter(([write]) => write === "removePhoto")).toEqual([]);
    });

    it("uploads nothing for a row that cannot be saved", async () => {
      const draft = editRows(draftFromCatalog(catalog), ["p-tocino"], {
        price: "",
        photo: dropped("tocino.jpg"),
      });
      const { writes, calls } = fakeWrites();

      await saveDraft(draft, catalog, writes);

      expect(calls).toEqual([]);
    });

    it("saves nothing for a row whose photo would not upload", async () => {
      const draft = editRows(draftFromCatalog(catalog), ["p-tocino"], {
        photo: dropped("tocino.jpg"),
      });
      const { writes, calls } = fakeWrites({ uploadPhoto: true });

      const results = await saveDraft(draft, catalog, writes);

      expect(calls).toEqual([["uploadPhoto", "tocino.jpg"]]);
      expect(results.get("p-tocino")).toEqual({
        status: "failed",
        productId: "p-tocino",
        message: "the upload failed",
      });
    });

    it("counts a save as done though the old photo could not be removed", async () => {
      const draft = editRows(draftFromCatalog(withPhoto), ["p-ribeye"], { photo: null });
      const { writes } = fakeWrites({ removePhoto: true });

      const results = await saveDraft(draft, withPhoto, writes);

      expect(results.get("p-ribeye")).toMatchObject({ status: "saved" });
    });

    it("does not upload a photo twice when a later write for the row failed", async () => {
      let draft = editRows(draftFromCatalog(catalog), ["p-tocino"], {
        photo: dropped("tocino.jpg"),
        available: false,
      });
      const { writes } = fakeWrites();
      writes.setProductAvailable = async () => {
        throw new Error("the switch failed");
      };

      draft = applyResults(draft, await saveDraft(draft, catalog, writes));
      const retry = fakeWrites();
      await saveDraft(draft, catalog, retry.writes);

      expect(retry.calls.some(([write]) => write === "uploadPhoto")).toBe(false);
      expect(retry.edits[0]?.photoPath).toBe("upload-1/large.webp");
    });

    it("leaves the row holding the stored photo, with nothing left to save", async () => {
      let draft = editRows(draftFromCatalog(catalog), ["p-tocino"], {
        photo: dropped("tocino.jpg"),
      });
      const { writes } = fakeWrites();

      draft = applyResults(draft, await saveDraft(draft, catalog, writes));
      const reread: Catalog = {
        ...catalog,
        products: [ribeye, { ...tocino, photoPath: "upload-1/large.webp" }, longganisa],
      };
      draft = syncDraft(draft, reread);

      expect(draft.rows[1]?.values.photo).toEqual({ path: "upload-1/large.webp" });
      expect(isDirty(draft)).toBe(false);
    });
  });
});
