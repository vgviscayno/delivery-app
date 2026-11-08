/**
 * What `/catalog/products` keeps in its URL, so a refresh or a pasted link opens the
 * same view: the Product open in the side panel and the filters. Never draft edits.
 */
export interface ProductsSearch extends ProductFilters {
  /** The Product open in the side panel. */
  readonly product?: string;
  /** The column the rows are sorted by, behind a "-" when descending. */
  readonly sort?: ProductsSort;
}

/** The columns the grid sorts by: the plain values, not Categories, photos or actions. */
export const SORTABLE = [
  "name",
  "priceType",
  "price",
  "step",
  "tolerance",
  "available",
] as const;

export type SortColumn = (typeof SORTABLE)[number];

export type ProductsSort = SortColumn | `-${SortColumn}`;

/** What the grid is narrowed to. Each is optional; together they must all match. */
export interface ProductFilters {
  /** Part of a Product's name, any case. */
  readonly q?: string;
  /** Only Products in this Category. */
  readonly category?: string;
  /** Only unavailable Products. */
  readonly unavailable?: 1;
  /** Only Products with no photo, to find the ones still to photograph. */
  readonly nophoto?: 1;
}

/**
 * The route's `validateSearch`. The router parses each value as JSON first, so `?q=250`
 * arrives as a number and `?unavailable=1` as `1`. Anything else is dropped, not refused,
 * so an old or hand-edited link still opens.
 */
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
