import type { Product } from "@courier/domain";
import { describe, expect, it } from "vitest";
import { formFromProduct, type ProductForm, readProductForm } from "./product-form.js";

const ribeye: Product = {
  id: "p-ribeye",
  name: "Ribeye",
  description: "Grain-fed, cut to order.",
  photoUrl: null,
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
  photoUrl: "https://example.com/tocino.jpg",
  available: false,
  price: { type: "per_unit", unitPriceCentavos: 16500 },
};

const perWeight = (fields: Partial<ProductForm>) =>
  readProductForm({ ...formFromProduct(ribeye), ...fields });

describe("the Product form", () => {
  it("shows a per-weight Product in pesos per kg and grams", () => {
    expect(formFromProduct(ribeye)).toEqual({
      name: "Ribeye",
      description: "Grain-fed, cut to order.",
      photoUrl: "",
      priceType: "per_weight",
      unitPricePesos: "",
      pricePerKgPesos: "1200.50",
      weightStepGrams: "250",
      toleranceGrams: "100",
    });
  });

  it("starts a new Product with the 250 g tolerance already filled in", () => {
    expect(formFromProduct(null)).toMatchObject({ toleranceGrams: "250", name: "" });
  });

  it.each([
    ["per-weight", ribeye],
    ["per-unit", tocino],
  ])("reads a %s Product back unchanged", (_, product) => {
    const { id: _id, available: _available, ...edits } = product;
    expect(readProductForm(formFromProduct(product))).toEqual({
      ok: true,
      edits,
      warnings: {},
    });
  });

  it("keeps a per-kg rate per kg, in whole centavos", () => {
    expect(perWeight({ pricePerKgPesos: "₱1,200.29" })).toMatchObject({
      ok: true,
      edits: { price: { pricePerKgCentavos: 120029 } },
    });
  });

  it("drops the fields of the price type not chosen", () => {
    const form = {
      ...formFromProduct(ribeye),
      priceType: "per_unit",
      unitPricePesos: "185",
    };
    expect(readProductForm(form as ProductForm)).toMatchObject({
      ok: true,
      edits: { price: { type: "per_unit", unitPriceCentavos: 18500 } },
    });
  });

  it("gives a blank tolerance the 250 g default", () => {
    expect(perWeight({ toleranceGrams: "" })).toMatchObject({
      ok: true,
      edits: { price: { toleranceGrams: 250 } },
    });
  });

  it.each(["250", "300"])(
    "warns, but still saves, when the tolerance (%s g) is not less than the step",
    (toleranceGrams) => {
      expect(perWeight({ toleranceGrams })).toMatchObject({
        ok: true,
        warnings: { toleranceGrams: expect.stringMatching(/step/) },
      });
    },
  );

  it("requires a rate, a step and a name, naming every missing one at once", () => {
    const result = perWeight({ name: " ", pricePerKgPesos: "", weightStepGrams: "" });

    expect(result.ok).toBe(false);
    expect(Object.keys(result.ok ? {} : result.errors).sort()).toEqual([
      "name",
      "pricePerKgPesos",
      "weightStepGrams",
    ]);
  });

  it.each([
    ["a zero step", { weightStepGrams: "0" }, "weightStepGrams"],
    ["a step in fractions of a gram", { weightStepGrams: "250.5" }, "weightStepGrams"],
    ["a free cut", { pricePerKgPesos: "0" }, "pricePerKgPesos"],
    ["a negative tolerance", { toleranceGrams: "-50" }, "toleranceGrams"],
    ["a photo that is not a web address", { photoUrl: "ribeye.jpg" }, "photoUrl"],
  ])("refuses %s", (_, fields, field) => {
    expect(perWeight(fields)).toMatchObject({
      ok: false,
      errors: { [field]: expect.any(String) },
    });
  });

  it("requires a unit price for a per-unit Product", () => {
    const form = { ...formFromProduct(tocino), unitPricePesos: "" };
    expect(readProductForm(form)).toMatchObject({
      ok: false,
      errors: { unitPricePesos: expect.any(String) },
    });
  });

  it("reads a blank description and photo as none", () => {
    expect(perWeight({ description: "  ", photoUrl: "" })).toMatchObject({
      ok: true,
      edits: { description: null, photoUrl: null },
    });
  });
});
