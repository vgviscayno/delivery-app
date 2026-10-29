import type { Database } from "./generated/database.types.js";

type Views = Database["public"]["Views"];
type ProductRow = Views["catalog_products"]["Row"];
type CategoryRow = Views["catalog_categories"]["Row"];
type MembershipRow = Views["catalog_memberships"]["Row"];

/**
 * How a Product is priced. Every amount is whole centavos; a per-weight rate is per
 * kilogram, never per gram, because a per-gram rate in whole centavos would round.
 */
export type Price =
  | { readonly type: "per_unit"; readonly unitPriceCentavos: number }
  | {
      readonly type: "per_weight";
      readonly pricePerKgCentavos: number;
      /** The increment a customer estimates their weight in, and also the least they may ask for. */
      readonly weightStepGrams: number;
      /** Symmetric: a shortfall counts the same as an excess. */
      readonly toleranceGrams: number;
    };

export type PriceType = Price["type"];

/** What the dispatcher edits about a Product, as one form. */
export interface ProductEdits {
  readonly name: string;
  readonly description: string | null;
  readonly photoUrl: string | null;
  readonly price: Price;
}

export interface Product extends ProductEdits {
  readonly id: string;
  /** A manual toggle, not a stock count. Always true in what customers read. */
  readonly available: boolean;
}

export interface Category {
  readonly id: string;
  readonly name: string;
  /** Display order, lowest first. */
  readonly position: number;
}

/** A Product's place within one Category. A Product may be in several, ranked in each. */
export interface CategoryMembership {
  readonly productId: string;
  readonly categoryId: string;
  readonly position: number;
}

export interface Catalog {
  readonly products: readonly Product[];
  /** In display order. */
  readonly categories: readonly Category[];
  readonly memberships: readonly CategoryMembership[];
}

export class CatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CatalogError";
  }
}

/**
 * A Product row from `catalog_products` or `dispatcher_products`. The view types every
 * column as nullable and the RPC as present, so this reads both as nullable and checks.
 * A row from the view has no `available` column: everything in it is available.
 */
export function toProduct(row: ProductRow & { available?: boolean | null }): Product {
  const name = required(row.name, "a Product's name");
  return {
    id: required(row.id, `the id of ${name}`),
    name,
    description: row.description,
    photoUrl: row.photo_url,
    available: row.available ?? true,
    price: toPrice(name, row),
  };
}

function toPrice(name: string, row: ProductRow): Price {
  if (row.price_type === "per_unit" && row.unit_price_centavos !== null) {
    return { type: "per_unit", unitPriceCentavos: row.unit_price_centavos };
  }
  if (
    row.price_type === "per_weight" &&
    row.price_per_kg_centavos !== null &&
    row.weight_step_grams !== null &&
    row.tolerance_grams !== null
  ) {
    return {
      type: "per_weight",
      pricePerKgCentavos: row.price_per_kg_centavos,
      weightStepGrams: row.weight_step_grams,
      toleranceGrams: row.tolerance_grams,
    };
  }
  throw new CatalogError(
    `the server sent ${name} with a price that does not match its type`,
  );
}

export function toCategory(row: CategoryRow): Category {
  return {
    id: required(row.id, "a Category's id"),
    name: required(row.name, "a Category's name"),
    position: required(row.position, "a Category's position"),
  };
}

export function toCategoryMembership(row: MembershipRow): CategoryMembership {
  return {
    productId: required(row.product_id, "a membership's Product"),
    categoryId: required(row.category_id, "a membership's Category"),
    position: required(row.position, "a membership's position"),
  };
}

/** The columns the tables declare `not null`, which views cannot say. */
function required<T>(value: T | null, what: string): T {
  if (value === null) throw new CatalogError(`the server sent no value for ${what}`);
  return value;
}
