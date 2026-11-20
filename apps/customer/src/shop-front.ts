import type { Catalog, Category, Product } from "@courier/domain";

/** One Category tab on the Shop screen and the Products under it, in order. */
export interface Shelf {
  readonly category: Category;
  readonly products: readonly Product[];
}

/**
 * The catalog as the Shop tab lays it out: Categories in the dispatcher's order, each
 * holding its Products by their position in that Category. A Product in two Categories
 * appears on both shelves, ranked separately in each. A Category with nothing in it
 * gets no tab: there would be nothing to show under it.
 */
export function shopFront(catalog: Catalog): readonly Shelf[] {
  const byId = new Map(catalog.products.map((p) => [p.id, p]));
  return [...catalog.categories]
    .sort((a, b) => a.position - b.position)
    .map((category) => ({
      category,
      products: catalog.memberships
        .filter((m) => m.categoryId === category.id)
        .sort((a, b) => a.position - b.position)
        .flatMap((m) => byId.get(m.productId) ?? []),
    }))
    .filter((shelf) => shelf.products.length > 0);
}
