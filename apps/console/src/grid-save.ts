import type { Catalog, ProductEdits } from "@courier/domain";
import {
  type CellMessages,
  changedFields,
  type Draft,
  type DraftRow,
  type GridField,
  linkProduct,
  markSaved,
  readRow,
} from "./product-grid.js";
import { messageOf } from "./write.js";

/** The server writes a Save is made of: the existing RPCs, one row at a time. */
export interface GridWrites {
  saveProduct(id: string | null, edits: ProductEdits): Promise<string>;
  setProductAvailable(id: string, available: boolean): Promise<void>;
  setCategoryProducts(categoryId: string, productIds: readonly string[]): Promise<void>;
}

/** How Save went for one row. Rows Save had nothing to write for have none. */
export type RowResult =
  | { readonly status: "saved"; readonly productId: string }
  | { readonly status: "invalid"; readonly errors: CellMessages }
  | {
      readonly status: "failed";
      /** Set when the Product itself was saved and a later write for it failed. */
      readonly productId: string | null;
      readonly message: string;
    }
  | {
      /** The Product and its availability were saved; its Category moves were not. */
      readonly status: "categoriesFailed";
      readonly productId: string;
      readonly message: string;
    };

/** The cells `save_product` writes. Availability and Categories have RPCs of their own. */
const PRODUCT_FIELDS: readonly GridField[] = [
  "name",
  "priceType",
  "price",
  "step",
  "tolerance",
  "description",
  "photoUrl",
];

/**
 * Writes every valid changed row and reports each row's result, keyed by row. A row that
 * is invalid or fails is left for the dispatcher to fix; the others are still written.
 */
export async function saveDraft(
  draft: Draft,
  catalog: Catalog,
  writes: GridWrites,
): Promise<Map<string, RowResult>> {
  const results = new Map<string, RowResult>();
  const changed = draft.rows.filter((row) => changedFields(row).length > 0);

  await Promise.all(
    changed.map(async (row) => {
      results.set(row.key, await saveRow(row, writes));
    }),
  );

  // Memberships go last, once every new Product has an id to put in a Category.
  const moves = changed.flatMap((row) => {
    const result = results.get(row.key);
    return result?.status === "saved" ? [{ row, productId: result.productId }] : [];
  });
  await Promise.all(
    [...categoryLists(catalog, moves)].map(async ([categoryId, list]) => {
      try {
        await writes.setCategoryProducts(categoryId, list.productIds);
      } catch (error) {
        const message = messageOf(error);
        for (const { key, productId } of list.movedBy) {
          results.set(key, { status: "categoriesFailed", productId, message });
        }
      }
    }),
  );

  return results;
}

/**
 * The draft once Save's results are in: saved rows have no edits left but the Category
 * moves that failed, and a new row whose Product was added before a later write failed
 * keeps that Product's id.
 */
export function applyResults(
  draft: Draft,
  results: ReadonlyMap<string, RowResult>,
): Draft {
  let next = draft;
  for (const [key, result] of results) {
    if (result.status === "saved") next = markSaved(next, key, result.productId);
    else if (result.status === "categoriesFailed") {
      next = markSaved(next, key, result.productId, { except: "categoryIds" });
    } else if (result.status === "failed" && result.productId !== null) {
      next = linkProduct(next, key, result.productId);
    }
  }
  return next;
}

interface Move {
  readonly row: DraftRow;
  readonly productId: string;
}

interface CategoryList {
  productIds: string[];
  /** The rows whose edits changed the list, who share its fate. */
  readonly movedBy: { readonly key: string; readonly productId: string }[];
}

/**
 * Each Category a saved row moved into or out of, with its Products in their new order:
 * as they were, less those taken out, and those newly added at the end in row order.
 */
function categoryLists(
  catalog: Catalog,
  moves: readonly Move[],
): Map<string, CategoryList> {
  const lists = new Map<string, CategoryList>();
  const listFor = (categoryId: string) => {
    let list = lists.get(categoryId);
    if (!list) {
      list = {
        productIds: catalog.memberships
          .filter((membership) => membership.categoryId === categoryId)
          .sort((a, b) => a.position - b.position)
          .map((membership) => membership.productId),
        movedBy: [],
      };
      lists.set(categoryId, list);
    }
    return list;
  };

  for (const { row, productId } of moves) {
    const before = row.saved?.categoryIds ?? [];
    const after = row.values.categoryIds;
    for (const categoryId of before.filter((id) => !after.includes(id))) {
      const list = listFor(categoryId);
      list.productIds = list.productIds.filter((id) => id !== productId);
      list.movedBy.push({ key: row.key, productId });
    }
    for (const categoryId of after.filter((id) => !before.includes(id))) {
      const list = listFor(categoryId);
      list.productIds.push(productId);
      list.movedBy.push({ key: row.key, productId });
    }
  }

  return lists;
}

async function saveRow(row: DraftRow, writes: GridWrites): Promise<RowResult> {
  const read = readRow(row);
  if (!read.ok) return { status: "invalid", errors: read.errors };

  const changed = changedFields(row);
  let productId = row.productId;
  try {
    if (productId === null || changed.some((field) => PRODUCT_FIELDS.includes(field))) {
      productId = await writes.saveProduct(productId, read.edits);
    }
    // A new Product starts available, so only an unavailable new row needs the switch.
    if (changed.includes("available")) {
      await writes.setProductAvailable(productId, row.values.available);
    }
    return { status: "saved", productId };
  } catch (error) {
    return { status: "failed", productId, message: messageOf(error) };
  }
}
