import type { Catalog, Category, Product } from "@courier/domain";

export interface Shelf {
  readonly category: Category;
  readonly products: readonly Product[];
}

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
