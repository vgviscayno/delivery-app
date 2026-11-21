import type { Price, PriceType, Product, ProductEdits } from "@courier/domain";
import { type Parsed, parsePesos } from "./parse.js";

const DEFAULT_TOLERANCE_GRAMS = 250;

const STEP_ERROR = "Enter the step in whole grams.";

export interface ProductForm {
  readonly name: string;
  readonly description: string;
  readonly photoPath: string | null;
  readonly priceType: PriceType;
  readonly unitPricePesos: string;
  readonly pricePerKgPesos: string;
  readonly weightStepGrams: string;
  readonly toleranceGrams: string;
}

export type ProductFormMessages = Partial<Record<keyof ProductForm, string>>;

export type ProductFormResult =
  | {
      readonly ok: true;
      readonly edits: ProductEdits;
      readonly warnings: ProductFormMessages;
    }
  | { readonly ok: false; readonly errors: ProductFormMessages };

export function formFromProduct(product: Product | null): ProductForm {
  const price = product?.price;
  return {
    name: product?.name ?? "",
    description: product?.description ?? "",
    photoPath: product?.photoPath ?? null,
    priceType: price?.type ?? "per_unit",
    unitPricePesos: price?.type === "per_unit" ? pesos(price.unitPriceCentavos) : "",
    pricePerKgPesos: price?.type === "per_weight" ? pesos(price.pricePerKgCentavos) : "",
    weightStepGrams: price?.type === "per_weight" ? String(price.weightStepGrams) : "",
    toleranceGrams: String(
      price?.type === "per_weight" ? price.toleranceGrams : DEFAULT_TOLERANCE_GRAMS,
    ),
  };
}

export function readProductForm(form: ProductForm): ProductFormResult {
  const errors: ProductFormMessages = {};
  const check = <T>(name: keyof ProductForm, parsed: Parsed<T>): T | undefined => {
    if (parsed.ok) return parsed.value;
    errors[name] = parsed.error;
    return undefined;
  };

  const name = form.name.trim();
  if (name === "") errors.name = "A Product needs a name.";

  let price: Price | undefined;
  if (form.priceType === "per_unit") {
    const unitPriceCentavos = check("unitPricePesos", parsePrice(form.unitPricePesos));
    if (unitPriceCentavos !== undefined) price = { type: "per_unit", unitPriceCentavos };
  } else {
    const pricePerKgCentavos = check("pricePerKgPesos", parsePrice(form.pricePerKgPesos));
    const weightStepGrams = check(
      "weightStepGrams",
      notBlank(parseGrams(form.weightStepGrams, 1, STEP_ERROR), STEP_ERROR),
    );
    const toleranceGrams = check(
      "toleranceGrams",
      parseGrams(
        form.toleranceGrams,
        0,
        "Enter the tolerance in whole grams, or leave it blank.",
      ),
    );
    if (
      pricePerKgCentavos !== undefined &&
      weightStepGrams !== undefined &&
      toleranceGrams !== undefined
    ) {
      price = {
        type: "per_weight",
        pricePerKgCentavos,
        weightStepGrams,
        toleranceGrams: toleranceGrams ?? DEFAULT_TOLERANCE_GRAMS,
      };
    }
  }

  if (Object.keys(errors).length > 0 || price === undefined) {
    return { ok: false, errors };
  }

  const warnings: ProductFormMessages = {};
  if (price.type === "per_weight" && price.toleranceGrams >= price.weightStepGrams) {
    warnings.toleranceGrams =
      "The tolerance is as large as the step, so a customer could receive a whole step " +
      "more or less than they asked for without being called.";
  }

  return {
    ok: true,
    edits: {
      name,
      description: form.description.trim() || null,
      photoPath: form.photoPath,
      price,
    },
    warnings,
  };
}

function parsePrice(text: string): Parsed<number> {
  const parsed = parsePesos(text);
  if (!parsed.ok) return parsed;
  if (parsed.value === null || parsed.value === 0) {
    return { ok: false, error: "Enter a price in pesos greater than zero." };
  }
  return { ok: true, value: parsed.value };
}

function parseGrams(text: string, min: number, error: string): Parsed<number | null> {
  const cleaned = text.trim();
  if (cleaned === "") return { ok: true, value: null };
  const grams = /^\d+$/.test(cleaned) ? Number(cleaned) : Number.NaN;
  if (!(grams >= min)) return { ok: false, error };
  return { ok: true, value: grams };
}

function notBlank<T>(parsed: Parsed<T | null>, error: string): Parsed<T> {
  if (!parsed.ok) return parsed;
  if (parsed.value === null) return { ok: false, error };
  return { ok: true, value: parsed.value };
}

function pesos(centavos: number): string {
  return (centavos / 100).toFixed(2);
}
