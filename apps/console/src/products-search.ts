export interface ProductsSearch extends ProductFilters {
  readonly product?: string;
  readonly sort?: ProductsSort;
}

const SORTABLE = [
  "name",
  "priceType",
  "price",
  "step",
  "tolerance",
  "available",
] as const;

export type SortColumn = (typeof SORTABLE)[number];

export type ProductsSort = SortColumn | `-${SortColumn}`;

export interface ProductFilters {
  readonly q?: string;
  readonly category?: string;
  readonly unavailable?: 1;
  readonly nophoto?: 1;
}

export function readProductsSearch(search: Record<string, unknown>): ProductsSearch {
  const product = nonEmptyText(search.product);
  const q = nonEmptyText(search.q);
  const category = nonEmptyText(search.category);
  const unavailable = search.unavailable === 1 || search.unavailable === "1";
  const nophoto = search.nophoto === 1 || search.nophoto === "1";
  const sort = readSort(search.sort);
  return {
    ...(product && { product }),
    ...(q && { q }),
    ...(category && { category }),
    ...(unavailable && { unavailable: 1 }),
    ...(nophoto && { nophoto: 1 }),
    ...(sort && { sort }),
  };
}

function readSort(value: unknown): ProductsSort | undefined {
  if (typeof value !== "string") return undefined;
  const column = value.startsWith("-") ? value.slice(1) : value;
  return (SORTABLE as readonly string[]).includes(column)
    ? (value as ProductsSort)
    : undefined;
}

function nonEmptyText(value: unknown): string | undefined {
  if (typeof value === "number") return String(value);
  if (typeof value === "string" && value.trim() !== "") return value;
  return undefined;
}
