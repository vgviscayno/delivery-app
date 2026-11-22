import type { Catalog, ProductEdits } from "@courier/domain";
import {
  type CellMessages,
  changedFields,
  type Draft,
  type DraftRow,
  droppedPhoto,
  editRows,
  type GridField,
  linkProduct,
  markSaved,
  readRow,
  storedPath,
} from "./product-grid.js";
import { messageOf } from "./write.js";

export interface GridWrites {
  saveProduct(id: string | null, edits: ProductEdits): Promise<string>;
  uploadPhoto(file: File): Promise<string>;
  removePhoto(path: string): Promise<void>;
  setProductAvailable(id: string, available: boolean): Promise<void>;
  setCategoryProducts(categoryId: string, productIds: readonly string[]): Promise<void>;
}

export type RowResult =
  | {
      readonly status: "saved";
      readonly productId: string;
      readonly photoPath?: string;
    }
  | { readonly status: "invalid"; readonly errors: CellMessages }
  | {
      readonly status: "failed";
      readonly productId: string | null;
      readonly photoPath?: string;
      readonly message: string;
    }
  | {
      readonly status: "categoriesFailed";
      readonly productId: string;
      readonly photoPath?: string;
      readonly message: string;
    };

const PRODUCT_FIELDS: readonly GridField[] = [
  "name",
  "priceType",
  "price",
  "step",
  "tolerance",
  "description",
  "photo",
];

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
          const saved = results.get(key);
          const photoPath = saved?.status === "saved" ? saved.photoPath : undefined;
          results.set(key, {
            status: "categoriesFailed",
            productId,
            ...withPhoto(photoPath),
            message,
          });
        }
      }
    }),
  );

  return results;
}

export function applyResults(
  draft: Draft,
  results: ReadonlyMap<string, RowResult>,
): Draft {
  let next = draft;
  for (const [key, result] of results) {
    if ("photoPath" in result && result.photoPath !== undefined) {
      next = editRows(next, [key], { photo: { path: result.photoPath } });
    }
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
  readonly movedBy: { readonly key: string; readonly productId: string }[];
}

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
  let photoPath: string | undefined;
  try {
    if (productId === null || changed.some((field) => PRODUCT_FIELDS.includes(field))) {
      ({ productId, photoPath } = await writeProduct(row, read.edits, writes));
    }
    if (changed.includes("available")) {
      await writes.setProductAvailable(productId, row.values.available);
    }
    return { status: "saved", productId, ...withPhoto(photoPath) };
  } catch (error) {
    return {
      status: "failed",
      productId,
      ...withPhoto(photoPath),
      message: messageOf(error),
    };
  }
}

async function writeProduct(
  row: DraftRow,
  edits: ProductEdits,
  writes: GridWrites,
): Promise<{ productId: string; photoPath?: string }> {
  const dropped = droppedPhoto(row.values.photo);
  const uploaded = dropped ? await writes.uploadPhoto(dropped.file) : undefined;
  const productId = await writes.saveProduct(row.productId, {
    ...edits,
    photoPath: uploaded ?? edits.photoPath,
  });

  const replaced = changedFields(row).includes("photo")
    ? storedPath(row.saved?.photo ?? null)
    : null;
  if (replaced !== null) await ignoreFailure(writes.removePhoto(replaced));

  return { productId, ...withPhoto(uploaded) };
}

function withPhoto(photoPath: string | undefined): { photoPath?: string } {
  return photoPath === undefined ? {} : { photoPath };
}

async function ignoreFailure(write: Promise<void>): Promise<void> {
  try {
    await write;
  } catch {}
}
