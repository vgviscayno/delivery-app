import {
  type Catalog,
  type Database,
  type ProductEdits,
  toCategory,
  toCategoryMembership,
  toProduct,
} from "@courier/domain";
import { ApiError, type CourierClient } from "./client.js";

const CATALOG_PRODUCTS = "catalog_products";
const CATALOG_CATEGORIES = "catalog_categories";
const CATALOG_MEMBERSHIPS = "catalog_memberships";
const DISPATCHER_PRODUCTS = "dispatcher_products";
const DISPATCHER_CATEGORY_PRODUCTS = "dispatcher_category_products";
const SAVE_PRODUCT = "save_product";
const SET_PRODUCT_AVAILABLE = "set_product_available";
const DELETE_PRODUCT = "delete_product";
const SAVE_CATEGORY = "save_category";
const REORDER_CATEGORIES = "reorder_categories";
const DELETE_CATEGORY = "delete_category";
const SET_CATEGORY_PRODUCTS = "set_category_products";

type Functions = Database["public"]["Functions"];
type Args<Name extends keyof Functions> = Functions[Name]["Args"];

// The generator types every RPC argument as required and non-null, because a function
// signature does not say otherwise. These RPCs take null for a new row's id, and for the
// price fields the other price type does not use.
type NullableArgs<Name extends keyof Functions> = {
  [K in keyof Args<Name>]: Args<Name>[K] | null;
};

/**
 * What a customer can order: available, undeleted Products, every Category in display
 * order, and where each Product sits in each. Any signed-in account may read it.
 */
export async function fetchCatalog(client: CourierClient): Promise<Catalog> {
  const [products, categories, memberships] = await Promise.all([
    client.from(CATALOG_PRODUCTS).select("*").order("name"),
    client.from(CATALOG_CATEGORIES).select("*").order("position"),
    client.from(CATALOG_MEMBERSHIPS).select("*").order("category_id").order("position"),
  ]);

  if (products.error) throw new ApiError(CATALOG_PRODUCTS, products.error);
  if (categories.error) throw new ApiError(CATALOG_CATEGORIES, categories.error);
  if (memberships.error) throw new ApiError(CATALOG_MEMBERSHIPS, memberships.error);

  return {
    products: (products.data ?? []).map(toProduct),
    categories: (categories.data ?? []).map(toCategory),
    memberships: (memberships.data ?? []).map(toCategoryMembership),
  };
}

/**
 * The whole catalog as the dispatcher keeps it: unavailable Products too, in their
 * places in each Category. Active dispatchers only.
 */
export async function fetchDispatcherCatalog(client: CourierClient): Promise<Catalog> {
  const [products, categories, memberships] = await Promise.all([
    client.rpc(DISPATCHER_PRODUCTS),
    client.from(CATALOG_CATEGORIES).select("*").order("position"),
    client.rpc(DISPATCHER_CATEGORY_PRODUCTS),
  ]);

  if (products.error) throw new ApiError(DISPATCHER_PRODUCTS, products.error);
  if (categories.error) throw new ApiError(CATALOG_CATEGORIES, categories.error);
  if (memberships.error) {
    throw new ApiError(DISPATCHER_CATEGORY_PRODUCTS, memberships.error);
  }

  return {
    products: (products.data ?? []).map(toProduct),
    categories: (categories.data ?? []).map(toCategory),
    memberships: (memberships.data ?? []).map(toCategoryMembership),
  };
}

/**
 * Adds a Product when `id` is null, or replaces every field of an existing one.
 * Returns its id. Active dispatchers only.
 */
export async function saveProduct(
  client: CourierClient,
  id: string | null,
  edits: ProductEdits,
): Promise<string> {
  const { price } = edits;
  const args: NullableArgs<typeof SAVE_PRODUCT> = {
    id,
    name: edits.name,
    description: edits.description,
    photo_url: edits.photoUrl,
    price_type: price.type,
    unit_price_centavos: price.type === "per_unit" ? price.unitPriceCentavos : null,
    price_per_kg_centavos: price.type === "per_weight" ? price.pricePerKgCentavos : null,
    weight_step_grams: price.type === "per_weight" ? price.weightStepGrams : null,
    tolerance_grams: price.type === "per_weight" ? price.toleranceGrams : null,
  };

  const { data, error } = await client.rpc(
    SAVE_PRODUCT,
    args as Args<typeof SAVE_PRODUCT>,
  );
  if (error) throw new ApiError(SAVE_PRODUCT, error);
  return data;
}

/** Switches a Product on or off for customers. */
export async function setProductAvailable(
  client: CourierClient,
  id: string,
  available: boolean,
): Promise<void> {
  await callWrite(client, SET_PRODUCT_AVAILABLE, { id, available });
}

/** Soft-deletes a Product: gone from every list and Category, kept for placed Orders. */
export async function deleteProduct(client: CourierClient, id: string): Promise<void> {
  await callWrite(client, DELETE_PRODUCT, { id });
}

/** Adds a Category at the end of the list when `id` is null, or renames one. */
export async function saveCategory(
  client: CourierClient,
  id: string | null,
  name: string,
): Promise<string> {
  const args: NullableArgs<typeof SAVE_CATEGORY> = { id, name };
  const { data, error } = await client.rpc(
    SAVE_CATEGORY,
    args as Args<typeof SAVE_CATEGORY>,
  );
  if (error) throw new ApiError(SAVE_CATEGORY, error);
  return data;
}

/** Puts the Categories in this order. Every Category must be listed exactly once. */
export async function reorderCategories(
  client: CourierClient,
  ids: readonly string[],
): Promise<void> {
  await callWrite(client, REORDER_CATEGORIES, { ids: [...ids] });
}

/** Deletes a Category. Its Products stay, in whatever other Categories they are in. */
export async function deleteCategory(client: CourierClient, id: string): Promise<void> {
  await callWrite(client, DELETE_CATEGORY, { id });
}

/**
 * Sets a Category's Products in order, replacing what it held: a Product left out is
 * taken out of the Category.
 */
export async function setCategoryProducts(
  client: CourierClient,
  categoryId: string,
  productIds: readonly string[],
): Promise<void> {
  await callWrite(client, SET_CATEGORY_PRODUCTS, {
    category_id: categoryId,
    product_ids: [...productIds],
  });
}

/** Calls an RPC that changes something and returns nothing, throwing if it refuses. */
async function callWrite<Name extends keyof Functions>(
  client: CourierClient,
  name: Name,
  args: Args<Name>,
): Promise<void> {
  const { error } = await client.rpc(name, args);
  if (error) throw new ApiError(name, error);
}
