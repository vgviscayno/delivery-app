import type { Catalog, PriceType, Product, ProductEdits } from "@courier/domain";
import {
  formFromProduct,
  type ProductForm,
  type ProductFormMessages,
  readProductForm,
} from "./product-form.js";
import type { ProductFilters, ProductsSort, SortColumn } from "./products-search.js";

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

export type RowPhoto = StoredPhoto | DroppedPhoto;

interface StoredPhoto {
  readonly path: string;
}

export interface DroppedPhoto {
  readonly file: File;
  readonly preview: string;
}

export function storedPath(photo: RowPhoto | null): string | null {
  return photo !== null && "path" in photo ? photo.path : null;
}

export function droppedPhoto(photo: RowPhoto | null): DroppedPhoto | null {
  return photo !== null && "file" in photo ? photo : null;
}

export type GridField = keyof RowValues;

export type CellMessages = Partial<Record<GridField, string>>;

export type RowRead =
  | {
      readonly ok: true;
      readonly edits: ProductEdits;
      readonly warnings: CellMessages;
    }
  | { readonly ok: false; readonly errors: CellMessages };

export interface DraftRow {
  readonly key: string;
  readonly productId: string | null;
  readonly saved: RowValues | null;
  readonly values: RowValues;
}

export interface Draft {
  readonly rows: readonly DraftRow[];
  readonly added: number;
}

const BLANK_ROW: RowValues = valuesFromForm(formFromProduct(null), true, []);

export function draftFromCatalog(catalog: Catalog): Draft {
  return {
    rows: catalog.products.map((product) => savedRow(product, catalog)),
    added: 0,
  };
}

export function addRow(draft: Draft): Draft {
  const added = draft.added + 1;
  return { rows: [...draft.rows, newRow(added, BLANK_ROW)], added };
}

export const TOUR_ROW_KEY = "tour-row";

const TOUR_ROW_VALUES: RowValues = {
  ...BLANK_ROW,
  name: "Sample Product",
  priceType: "per_weight",
  price: "450.00",
  step: "250",
  tolerance: "30",
};

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

export function withoutTourRow(draft: Draft): Draft {
  return removeRows(draft, [TOUR_ROW_KEY]);
}

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

export function linkProduct(draft: Draft, key: string, productId: string): Draft {
  return {
    ...draft,
    rows: draft.rows.map((row) => (row.key === key ? { ...row, productId } : row)),
  };
}

export function removeRows(draft: Draft, keys: readonly string[]): Draft {
  return { ...draft, rows: draft.rows.filter((row) => !keys.includes(row.key)) };
}

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

type SortKey = readonly [group: number, value: string | number];

const LAST: SortKey = [Number.POSITIVE_INFINITY, 0];

const SORT_KEY: Record<SortColumn, (values: RowValues) => SortKey> = {
  name: (values) => [0, values.name.toLocaleLowerCase()],
  priceType: (values) => [0, values.priceType],
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

export function hasCell(values: RowValues, field: GridField): boolean {
  return values.priceType === "per_weight" || (field !== "step" && field !== "tolerance");
}

function savedRow(product: Product, catalog: Catalog): DraftRow {
  const values = valuesFromProduct(product, catalog);
  return { key: product.id, productId: product.id, saved: values, values };
}

function newRow(added: number, values: RowValues): DraftRow {
  return { key: `new-${added}`, productId: null, saved: null, values };
}

export function editRows(
  draft: Draft,
  keys: readonly string[],
  edits: Partial<RowValues>,
): Draft {
  return mapRows(draft, keys, (values) => ({ ...values, ...edits }));
}

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

export function changedFields(row: DraftRow): GridField[] {
  const { values } = row;
  const saved = row.saved ?? BLANK_ROW;
  return (Object.keys(values) as GridField[]).filter(
    (field) => hasCell(values, field) && !sameValue(values[field], saved[field]),
  );
}

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
  if (isStored(a) && isStored(b)) return a.path === b.path;
  return a === b;
}

function isStored(value: RowValues[GridField]): value is StoredPhoto {
  return typeof value === "object" && value !== null && "path" in value;
}
