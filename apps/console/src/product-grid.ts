import type { Catalog, PriceType, Product, ProductEdits } from "@courier/domain";
import {
  formFromProduct,
  type ProductForm,
  type ProductFormMessages,
  readProductForm,
} from "./product-form.js";
import type { ProductFilters, ProductsSort, SortColumn } from "./products-search.js";

/**
 * One row of the Products grid as the dispatcher types it. A single price cell serves
 * both price types: per unit it is the price of one, per weight the rate per kg.
 */
export interface RowValues {
  readonly name: string;
  readonly priceType: PriceType;
  readonly price: string;
  readonly step: string;
  readonly tolerance: string;
  readonly available: boolean;
  readonly categoryIds: readonly string[];
  readonly description: string;
  readonly photo: RowPhoto | null;
}

/**
 * A row's photo: one already in Storage, or one dropped on the row and shown from the
 * browser's copy until Save uploads it.
 */
export type RowPhoto = StoredPhoto | DroppedPhoto;

export interface StoredPhoto {
  /** Where the large photo is in the `product-photos` bucket. */
  readonly path: string;
}

export interface DroppedPhoto {
  readonly file: File;
  /** An object URL for the dropped file. */
  readonly preview: string;
}

/** The path of a photo already in Storage; null for none, or one not yet uploaded. */
export function storedPath(photo: RowPhoto | null): string | null {
  return photo !== null && "path" in photo ? photo.path : null;
}

/** A photo dropped on the row and not yet uploaded, if that is what it holds. */
export function droppedPhoto(photo: RowPhoto | null): DroppedPhoto | null {
  return photo !== null && "file" in photo ? photo : null;
}

export type GridField = keyof RowValues;

export type CellMessages = Partial<Record<GridField, string>>;

export type RowRead =
  | {
      readonly ok: true;
      readonly edits: ProductEdits;
      /** Shown on the cell, but no reason to refuse the save. */
      readonly warnings: CellMessages;
    }
  | { readonly ok: false; readonly errors: CellMessages };

export interface DraftRow {
  /** Stable for the life of the row, saved or not, so React and the URL can follow it. */
  readonly key: string;
  /** Null until the row is first saved. */
  readonly productId: string | null;
  /** The row as the server last had it; null for a row never saved. */
  readonly saved: RowValues | null;
  readonly values: RowValues;
}

/** Every edit since the last Save, kept in the page and never written until Save. */
export interface Draft {
  readonly rows: readonly DraftRow[];
  /** How many rows have been added, so each new row gets a key of its own. */
  readonly added: number;
}

/** A new row: per unit, available, no step, and the 250 g tolerance already filled in. */
const BLANK_ROW: RowValues = valuesFromForm(formFromProduct(null), true, []);

export function draftFromCatalog(catalog: Catalog): Draft {
  return {
    rows: catalog.products.map((product) => savedRow(product, catalog)),
    added: 0,
  };
}

/** Appends a blank row. */
export function addRow(draft: Draft): Draft {
  const added = draft.added + 1;
  return { rows: [...draft.rows, newRow(added, BLANK_ROW)], added };
}

/** The key of the row the Products tour adds to demonstrate on. Never a `new-` key. */
export const TOUR_ROW_KEY = "tour-row";

/** What the tour's row holds: a per-weight Product, so every column has a value. */
const TOUR_ROW_VALUES: RowValues = {
  ...BLANK_ROW,
  name: "Sample Product",
  priceType: "per_weight",
  price: "450.00",
  step: "250",
  tolerance: "30",
};

/** Appends the tour's own row, unless it is already there. */
export function addTourRow(draft: Draft): Draft {
  if (draft.rows.some((row) => row.key === TOUR_ROW_KEY)) return draft;
  const row: DraftRow = {
    key: TOUR_ROW_KEY,
    productId: null,
    saved: null,
    values: TOUR_ROW_VALUES,
  };
  return { ...draft, rows: [...draft.rows, row] };
}

/** The draft as the dispatcher made it: what Save writes and what counts as unsaved. */
export function withoutTourRow(draft: Draft): Draft {
  return removeRows(draft, [TOUR_ROW_KEY]);
}

/**
 * Copies a row, all but its name and photo, into a new row directly below it. Two
 * Products never share photo files: replacing one's photo removes the old files.
 */
export function duplicateRow(draft: Draft, key: string): Draft {
  const added = draft.added + 1;
  return {
    rows: draft.rows.flatMap((row) =>
      row.key === key
        ? [row, newRow(added, { ...row.values, name: "", photo: null })]
        : [row],
    ),
    added,
  };
}

/**
 * Copies one cell of the `from` row into the same cell of each `to` row. A per-unit row
 * is skipped for step and tolerance, since it has neither. A photo is never copied, for
 * the reason `duplicateRow` gives.
 */
export function fillDown(
  draft: Draft,
  field: GridField,
  from: string,
  to: readonly string[],
): Draft {
  const source = draft.rows.find((row) => row.key === from);
  if (!source || field === "photo") return draft;
  const value = source.values[field];
  return {
    ...draft,
    rows: draft.rows.map((row) =>
      to.includes(row.key) && hasCell(row.values, field)
        ? { ...row, values: { ...row.values, [field]: value } }
        : row,
    ),
  };
}

/**
 * Reads a row into the Product it would save, with each error or warning on the cell it
 * is about. The rules are the Product form's. A photo not yet uploaded reads as none:
 * Save uploads it and puts its path in.
 */
export function readRow(row: DraftRow): RowRead {
  const { values } = row;
  const read = readProductForm({
    name: values.name,
    description: values.description,
    photoPath: storedPath(values.photo),
    priceType: values.priceType,
    unitPricePesos: values.price,
    pricePerKgPesos: values.price,
    weightStepGrams: values.step,
    toleranceGrams: values.tolerance,
  });
  return read.ok
    ? { ok: true, edits: read.edits, warnings: onCells(read.warnings) }
    : { ok: false, errors: onCells(read.errors) };
}

/** Which cell holds each of the Product form's fields. */
const CELL: Record<keyof ProductForm, GridField> = {
  name: "name",
  description: "description",
  photoPath: "photo",
  priceType: "priceType",
  unitPricePesos: "price",
  pricePerKgPesos: "price",
  weightStepGrams: "step",
  toleranceGrams: "tolerance",
};

function onCells(messages: ProductFormMessages): CellMessages {
  const cells: CellMessages = {};
  for (const [field, message] of Object.entries(messages)) {
    cells[CELL[field as keyof ProductForm]] = message;
  }
  return cells;
}

/**
 * Records that a row was saved as it stands, under the Product id the server gave it:
 * all of it, or all but the one cell whose write failed.
 */
export function markSaved(
  draft: Draft,
  key: string,
  productId: string,
  { except }: { except?: GridField } = {},
): Draft {
  return {
    ...draft,
    rows: draft.rows.map((row) => {
      if (row.key !== key) return row;
      const before = row.saved ?? BLANK_ROW;
      const saved = except ? { ...row.values, [except]: before[except] } : row.values;
      return { ...row, productId, saved };
    }),
  };
}

/**
 * Ties a row to the Product the server made for it, without counting its edits as saved:
 * for a row whose Product was added but whose later writes failed.
 */
export function linkProduct(draft: Draft, key: string, productId: string): Draft {
  return {
    ...draft,
    rows: draft.rows.map((row) => (row.key === key ? { ...row, productId } : row)),
  };
}

export function removeRows(draft: Draft, keys: readonly string[]): Draft {
  return { ...draft, rows: draft.rows.filter((row) => !keys.includes(row.key)) };
}

/**
 * Brings the draft up to a freshly read catalog. Cells edited and not yet saved keep
 * the edit; every other cell takes the server's value. Deleted Products drop out, and
 * Products the draft has not seen are added at the end.
 */
export function syncDraft(draft: Draft, catalog: Catalog): Draft {
  const products = new Map(catalog.products.map((product) => [product.id, product]));
  const seen = new Set<string>();
  const rows = draft.rows.flatMap((row): DraftRow[] => {
    if (row.productId === null) return [row];
    const product = products.get(row.productId);
    if (!product) return [];
    seen.add(product.id);
    const saved = valuesFromProduct(product, catalog);
    const edited = changedFields(row);
    const values = { ...saved };
    for (const field of edited) Object.assign(values, { [field]: row.values[field] });
    return [{ ...row, saved, values }];
  });
  const unseen = catalog.products
    .filter((product) => !seen.has(product.id))
    .map((product) => savedRow(product, catalog));
  return { ...draft, rows: [...rows, ...unseen] };
}

/**
 * The rows the filters let through. They match what was saved, so a row does not vanish
 * while it is being edited; a row never saved has nothing to match and is always shown.
 */
export function visibleRows(draft: Draft, filters: ProductFilters): DraftRow[] {
  const q = filters.q?.trim().toLowerCase() ?? "";
  return draft.rows.filter(({ saved }) => {
    if (saved === null) return true;
    if (q !== "" && !saved.name.toLowerCase().includes(q)) return false;
    if (filters.category && !saved.categoryIds.includes(filters.category)) return false;
    if (filters.unavailable && saved.available) return false;
    if (filters.nophoto && saved.photo !== null) return false;
    return true;
  });
}

/**
 * The rows in the order sorted. Like the filters it reads what was saved, so a row holds
 * still while it is edited. Rows never saved stay at the bottom in the order added, and
 * ties keep the catalog's order.
 */
export function sortRows(
  rows: readonly DraftRow[],
  sort: ProductsSort | undefined,
): DraftRow[] {
  if (sort === undefined) return [...rows];
  const desc = sort.startsWith("-");
  const column = (desc ? sort.slice(1) : sort) as SortColumn;
  const saved = rows.filter((row) => row.saved !== null);
  const unsaved = rows.filter((row) => row.saved === null);
  const order = (row: DraftRow) => SORT_KEY[column](row.saved as RowValues);
  saved.sort((a, b) => compareKeys(order(a), order(b), desc));
  return [...saved, ...unsaved];
}

/**
 * What each column sorts on: a group that holds its place either way, then a value that
 * turns around when descending. A row with no value for the column goes in a last group.
 */
type SortKey = readonly [group: number, value: string | number];

const LAST: SortKey = [Number.POSITIVE_INFINITY, 0];

const SORT_KEY: Record<SortColumn, (values: RowValues) => SortKey> = {
  name: (values) => [0, values.name.toLocaleLowerCase()],
  priceType: (values) => [0, values.priceType],
  // Per unit and per kg are not comparable amounts, so each sorts among its own.
  price: (values) => [values.priceType === "per_unit" ? 0 : 1, Number(values.price)],
  step: (values) => (hasCell(values, "step") ? [0, Number(values.step)] : LAST),
  tolerance: (values) =>
    hasCell(values, "tolerance") ? [0, Number(values.tolerance)] : LAST,
  available: (values) => [0, values.available ? 0 : 1],
};

function compareKeys(a: SortKey, b: SortKey, desc: boolean): number {
  if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1;
  const order =
    typeof a[1] === "string" && typeof b[1] === "string"
      ? a[1].localeCompare(b[1])
      : Number(a[1]) - Number(b[1]);
  return desc ? -order : order;
}

/**
 * What Ctrl+D fills, from the row at `index` among the rows shown: this cell into every
 * ticked row below it, or, with none ticked below, this cell from the row above, as a
 * spreadsheet does for a single cell.
 */
export function fillDownTargets(
  keys: readonly string[],
  index: number,
  ticked: ReadonlySet<string>,
): { from: string; to: string[] } | null {
  const here = keys[index];
  if (here === undefined) return null;
  const below = keys.slice(index + 1).filter((key) => ticked.has(key));
  if (below.length > 0) return { from: here, to: below };
  const above = keys[index - 1];
  return above === undefined ? null : { from: above, to: [here] };
}

/** Whether a row has this cell at all: step and tolerance only on a per-weight row. */
export function hasCell(values: RowValues, field: GridField): boolean {
  return values.priceType === "per_weight" || (field !== "step" && field !== "tolerance");
}

/** A Product's row with no edits. */
function savedRow(product: Product, catalog: Catalog): DraftRow {
  const values = valuesFromProduct(product, catalog);
  return { key: product.id, productId: product.id, saved: values, values };
}

function newRow(added: number, values: RowValues): DraftRow {
  return { key: `new-${added}`, productId: null, saved: null, values };
}

/** Changes the same cells of one or more rows. */
export function editRows(
  draft: Draft,
  keys: readonly string[],
  edits: Partial<RowValues>,
): Draft {
  return mapRows(draft, keys, (values) => ({ ...values, ...edits }));
}

/** Puts rows in a Category they are not already in. */
export function addToCategory(
  draft: Draft,
  keys: readonly string[],
  categoryId: string,
): Draft {
  return mapRows(draft, keys, (values) =>
    values.categoryIds.includes(categoryId)
      ? values
      : { ...values, categoryIds: [...values.categoryIds, categoryId] },
  );
}

/** Takes rows out of a Category. */
export function removeFromCategory(
  draft: Draft,
  keys: readonly string[],
  categoryId: string,
): Draft {
  return mapRows(draft, keys, (values) => ({
    ...values,
    categoryIds: values.categoryIds.filter((id) => id !== categoryId),
  }));
}

function mapRows(
  draft: Draft,
  keys: readonly string[],
  change: (values: RowValues) => RowValues,
): Draft {
  return {
    ...draft,
    rows: draft.rows.map((row) =>
      keys.includes(row.key) ? { ...row, values: change(row.values) } : row,
    ),
  };
}

/** The cells that differ from what was last saved. A per-unit row has no step or tolerance. */
export function changedFields(row: DraftRow): GridField[] {
  const { values } = row;
  const saved = row.saved ?? BLANK_ROW;
  return (Object.keys(values) as GridField[]).filter(
    (field) => hasCell(values, field) && !sameValue(values[field], saved[field]),
  );
}

/** Whether any row has an edit that Save would write. */
export function isDirty(draft: Draft): boolean {
  return draft.rows.some((row) => changedFields(row).length > 0);
}

function valuesFromProduct(product: Product, catalog: Catalog): RowValues {
  return valuesFromForm(
    formFromProduct(product),
    product.available,
    catalog.memberships
      .filter((membership) => membership.productId === product.id)
      .map((membership) => membership.categoryId),
  );
}

function valuesFromForm(
  form: ProductForm,
  available: boolean,
  categoryIds: readonly string[],
): RowValues {
  return {
    name: form.name,
    priceType: form.priceType,
    price: form.priceType === "per_unit" ? form.unitPricePesos : form.pricePerKgPesos,
    step: form.weightStepGrams,
    tolerance: form.toleranceGrams,
    available,
    categoryIds,
    description: form.description,
    photo: form.photoPath === null ? null : { path: form.photoPath },
  };
}

function sameValue(a: RowValues[GridField], b: RowValues[GridField]): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((id) => b.includes(id));
  }
  // A stored photo is the same photo by path; a dropped one only as the same drop.
  if (isStored(a) && isStored(b)) return a.path === b.path;
  return a === b;
}

function isStored(value: RowValues[GridField]): value is StoredPhoto {
  return typeof value === "object" && value !== null && "path" in value;
}
