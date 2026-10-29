import type { Price, PriceType, Product, ProductEdits } from "@courier/domain";
import { type Parsed, parsePesos } from "./parse.js";

/** The tolerance a per-weight Product starts with, and gets when left blank. */
const DEFAULT_TOLERANCE_GRAMS = 250;

const STEP_ERROR = "Enter the step in whole grams.";

/**
 * The Product form as the dispatcher types it: pesos rather than centavos, and grams.
 * Both price types' fields are kept while the form is open, so switching back and
 * forth loses nothing; only the chosen type's are read.
 */
export interface ProductForm {
  readonly name: string;
  readonly description: string;
  readonly photoUrl: string;
  readonly priceType: PriceType;
  readonly unitPricePesos: string;
  /** Per kilogram. */
  readonly pricePerKgPesos: string;
  readonly weightStepGrams: string;
  readonly toleranceGrams: string;
}

export type ProductFormMessages = Partial<Record<keyof ProductForm, string>>;

export type ProductFormResult =
  | {
      readonly ok: true;
      readonly edits: ProductEdits;
      /** Worth a second look, but no reason to refuse the save. */
      readonly warnings: ProductFormMessages;
    }
  | { readonly ok: false; readonly errors: ProductFormMessages };

/** The form for an existing Product, or a blank one (per unit) for a new Product. */
export function formFromProduct(product: Product | null): ProductForm {
  const price = product?.price;
  return {
    name: product?.name ?? "",
    description: product?.description ?? "",
    photoUrl: product?.photoUrl ?? "",
    priceType: price?.type ?? "per_unit",
    unitPricePesos: price?.type === "per_unit" ? pesos(price.unitPriceCentavos) : "",
    pricePerKgPesos: price?.type === "per_weight" ? pesos(price.pricePerKgCentavos) : "",
    weightStepGrams: price?.type === "per_weight" ? String(price.weightStepGrams) : "",
    toleranceGrams: String(
      price?.type === "per_weight" ? price.toleranceGrams : DEFAULT_TOLERANCE_GRAMS,
    ),
  };
}

/**
 * Reads the whole form, naming every field that is wrong at once. The checks repeat the
 * server's to say what is wrong in words; the server still has the last say.
 */
export function readProductForm(form: ProductForm): ProductFormResult {
  const errors: ProductFormMessages = {};
  const check = <T>(name: keyof ProductForm, parsed: Parsed<T>): T | undefined => {
    if (parsed.ok) return parsed.value;
    errors[name] = parsed.error;
    return undefined;
  };

  const name = form.name.trim();
  if (name === "") errors.name = "A Product needs a name.";
  const photoUrl = check("photoUrl", parsePhotoUrl(form.photoUrl));

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

  if (Object.keys(errors).length > 0 || price === undefined || photoUrl === undefined) {
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
      photoUrl,
      price,
    },
    warnings,
  };
}

/** A price in pesos, required and more than zero, as whole centavos. */
function parsePrice(text: string): Parsed<number> {
  const parsed = parsePesos(text);
  if (!parsed.ok) return parsed;
  if (parsed.value === null || parsed.value === 0) {
    return { ok: false, error: "Enter a price in pesos greater than zero." };
  }
  return { ok: true, value: parsed.value };
}

/** Whole grams, at least `min`. Blank is `null`. */
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

function parsePhotoUrl(text: string): Parsed<string | null> {
  const cleaned = text.trim();
  if (cleaned === "") return { ok: true, value: null };
  if (!/^https?:\/\/\S+$/.test(cleaned)) {
    return {
      ok: false,
      error: "Enter a web address starting with https://, or leave it blank.",
    };
  }
  return { ok: true, value: cleaned };
}

/** Whole centavos as pesos to two places: `120050` → `1200.50`. */
function pesos(centavos: number): string {
  return (centavos / 100).toFixed(2);
}
