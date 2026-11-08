import {
  type CourierClient,
  deleteCategory,
  fetchDispatcherCatalog,
  reorderCategories,
  saveCategory,
  setCategoryProducts,
} from "@courier/api-client";
import type { Catalog as CatalogData, Category, Product } from "@courier/domain";
import { Outlet } from "@tanstack/react-router";
import {
  createContext,
  type FormEvent,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useOptimisticOrder } from "./reorder.js";
import { SubTabs } from "./SubTabs.js";
import { SortableList, useSortableRow } from "./sortable.js";
import { ShowMeAround, TourHost, useTour, useTourHost } from "./Tour.js";
import { useClient } from "./use-client.js";
import { Failure, messageOf, useWrite } from "./write.js";

type Load =
  | { readonly state: "loading" }
  | { readonly state: "ready"; readonly catalog: CatalogData }
  | { readonly state: "error"; readonly message: string };

interface SectionProps {
  readonly client: CourierClient;
  readonly catalog: CatalogData;
  readonly onSaved: () => Promise<void>;
}

/** The catalog as last read, for whichever section the URL has open. */
const CatalogContext = createContext<SectionProps | null>(null);

export function useCatalog(): SectionProps {
  const section = useContext(CatalogContext);
  if (!section) throw new Error("A Catalog section must be rendered inside Catalog");
  return section;
}

/**
 * The console's Catalog mode: Products of both price types, and the Categories customers
 * browse them by, one section at a time. The catalog is read once for both, and like
 * Settings, every change is read back from the server afterwards.
 */
export function Catalog() {
  const client = useClient();
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const tours = useTourHost();

  const reload = useCallback(async () => {
    try {
      setLoad({ state: "ready", catalog: await fetchDispatcherCatalog(client) });
    } catch (error) {
      setLoad({ state: "error", message: messageOf(error) });
    }
  }, [client]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <div className="surface catalog">
      <div className="catalog-head">
        <SubTabs
          label="Catalog sections"
          tabs={[
            { label: "Products", to: "/catalog/products" },
            { label: "Categories", to: "/catalog/categories" },
          ]}
        />
        <ShowMeAround host={tours} disabled={load.state !== "ready"} />
      </div>
      {load.state === "loading" ? (
        <p className="detail">Loading the catalog…</p>
      ) : load.state === "error" ? (
        <p className="notice" role="alert">
          {load.message}
        </p>
      ) : (
        <CatalogContext.Provider
          value={{ client, catalog: load.catalog, onSaved: reload }}
        >
          <TourHost value={tours.value}>
            <Outlet />
          </TourHost>
        </CatalogContext.Provider>
      )}
    </div>
  );
}

/**
 * Categories down a sidebar, in the order customers browse them, and the open one's name,
 * moves and Products beside it. Opening a Category is local to the page; the first is
 * open until another is picked, and again after the open one is deleted.
 */
export function CategoriesSection() {
  const { client, catalog, onSaved } = useCatalog();
  const [name, setName] = useState("");
  const [openId, setOpenId] = useState<string>();
  const { busy, error, run } = useWrite(onSaved);
  const { order, drop } = useOptimisticOrder(
    catalog.categories.map((category) => category.id),
    (ids) => run(() => reorderCategories(client, ids)),
  );
  const categories = order.flatMap(
    (id) => catalog.categories.find((category) => category.id === id) ?? [],
  );
  const openIndex = Math.max(
    0,
    categories.findIndex((category) => category.id === openId),
  );
  const open = categories[openIndex];
  // The tour only points: it neither drags nor moves anything.
  useTour("categories");

  async function add(event: FormEvent) {
    event.preventDefault();
    if (await run(() => saveCategory(client, null, name.trim()))) setName("");
  }

  return (
    <section aria-labelledby="categories-heading" className="categories-section">
      <h2 id="categories-heading">Categories</h2>
      <p className="detail">
        How customers browse the catalog, in this order. A Product can be in several.
      </p>
      <div className="categories-split">
        <div className="categories-list" data-tour="category-list">
          {categories.length === 0 ? (
            <p className="detail">No Categories yet.</p>
          ) : (
            <SortableList onDrop={(from, to) => void drop(from, to)}>
              <ol aria-label="Categories">
                {categories.map((category, index) => (
                  <CategoryRow
                    key={category.id}
                    category={category}
                    count={
                      catalog.memberships.filter(
                        (membership) => membership.categoryId === category.id,
                      ).length
                    }
                    index={index}
                    open={category === open}
                    onOpen={() => setOpenId(category.id)}
                    disabled={busy}
                  />
                ))}
              </ol>
            </SortableList>
          )}
          <Failure message={error} />
          <form onSubmit={add} className="add-row">
            <input
              type="text"
              aria-label="New Category name"
              placeholder="New Category"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <button type="submit" disabled={busy}>
              Add
            </button>
          </form>
        </div>
        {open && (
          <CategoryDetail
            // A fresh detail whenever the name changes, so its input starts from it.
            key={`${open.id}-${open.name}`}
            client={client}
            catalog={catalog}
            category={open}
            onSaved={onSaved}
            onMove={(by) => void drop(openIndex, openIndex + by)}
            first={openIndex === 0}
            last={openIndex === categories.length - 1}
            moving={busy}
          />
        )}
      </div>
    </section>
  );
}

function CategoryRow({
  category,
  count,
  index,
  open,
  onOpen,
  disabled,
}: {
  category: Category;
  count: number;
  index: number;
  open: boolean;
  onOpen: () => void;
  disabled: boolean;
}) {
  const row = useSortableRow({ id: category.id, name: category.name, index, disabled });

  return (
    <li
      ref={row.ref}
      className={row.isDragging ? "category-row dragging" : "category-row"}
      data-open={open ? "" : undefined}
      data-tour={index === 0 ? "category-row" : undefined}
    >
      {row.handle}
      <button
        type="button"
        className="category-open"
        aria-current={open ? "true" : undefined}
        onClick={onOpen}
      >
        <span className="category-name">{category.name}</span>
        <span className="category-count" title={`${count} Products`}>
          {count}
        </span>
      </button>
    </li>
  );
}

function CategoryDetail({
  client,
  catalog,
  category,
  onSaved,
  onMove,
  first,
  last,
  moving,
}: SectionProps & {
  category: Category;
  onMove: (by: -1 | 1) => void;
  first: boolean;
  last: boolean;
  moving: boolean;
}) {
  const [name, setName] = useState(category.name);
  const [adding, setAdding] = useState("");
  const { busy, error, run } = useWrite(onSaved);
  const disabled = busy || moving;

  const members = catalog.memberships
    .filter((membership) => membership.categoryId === category.id)
    .sort((a, b) => a.position - b.position)
    .flatMap((membership) => {
      const product = catalog.products.find((each) => each.id === membership.productId);
      return product ? [product] : [];
    });
  const others = catalog.products.filter((product) => !members.includes(product));
  const { order, drop } = useOptimisticOrder(
    members.map((product) => product.id),
    (productIds) => run(() => setCategoryProducts(client, category.id, productIds)),
  );
  const products = order.flatMap((id) => members.find((each) => each.id === id) ?? []);

  const arrange = (productIds: readonly string[]) =>
    void run(() => setCategoryProducts(client, category.id, productIds));

  return (
    <div className="category-detail">
      <div className="category-detail-head">
        <div className="category-name-field">
          <label>
            <span className="field-label">Name</span>
            <input
              type="text"
              aria-label={`Name of ${category.name}`}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          {name.trim() !== category.name && (
            <button
              type="button"
              disabled={disabled || name.trim() === ""}
              onClick={() =>
                void run(() => saveCategory(client, category.id, name.trim()))
              }
            >
              Rename
            </button>
          )}
        </div>
        <div className="row-actions">
          <span className="move-pair" data-tour="category-move">
            <button
              type="button"
              aria-label={`Move ${category.name} up`}
              disabled={disabled || first}
              onClick={() => onMove(-1)}
            >
              ↑
            </button>
            <button
              type="button"
              aria-label={`Move ${category.name} down`}
              disabled={disabled || last}
              onClick={() => onMove(1)}
            >
              ↓
            </button>
          </span>
          <button
            type="button"
            className="danger"
            disabled={disabled}
            onClick={() => {
              if (
                window.confirm(`Delete the ${category.name} Category? Its Products stay.`)
              ) {
                void run(() => deleteCategory(client, category.id));
              }
            }}
          >
            Delete
          </button>
        </div>
      </div>
      {others.length > 0 && (
        <div className="add-row">
          <select
            aria-label={`Product to add to ${category.name}`}
            value={adding}
            onChange={(event) => setAdding(event.target.value)}
          >
            <option value="">Add a Product…</option>
            {others.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={disabled || adding === ""}
            onClick={() => {
              arrange([...order, adding]);
              setAdding("");
            }}
          >
            Add
          </button>
        </div>
      )}
      <Failure message={error} />
      {products.length === 0 ? (
        <p className="detail">No Products in this Category.</p>
      ) : (
        <SortableList onDrop={(from, to) => void drop(from, to)}>
          <ol
            className="category-products"
            aria-label={`Products in ${category.name}`}
            data-tour="category-products"
          >
            {products.map((product, productIndex) => (
              <ProductItem
                key={product.id}
                product={product}
                category={category}
                index={productIndex}
                last={productIndex === products.length - 1}
                disabled={disabled}
                onMove={(by) => void drop(productIndex, productIndex + by)}
                onRemove={() => arrange(order.filter((id) => id !== product.id))}
              />
            ))}
          </ol>
        </SortableList>
      )}
    </div>
  );
}

function ProductItem({
  product,
  category,
  index,
  last,
  disabled,
  onMove,
  onRemove,
}: {
  product: Product;
  category: Category;
  index: number;
  last: boolean;
  disabled: boolean;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}) {
  const row = useSortableRow({ id: product.id, name: product.name, index, disabled });

  return (
    <li ref={row.ref} className={row.isDragging ? "product-row dragging" : "product-row"}>
      {row.handle}
      <span className="product-position" aria-hidden="true">
        {index + 1}
      </span>
      <span className="product-name">
        {product.name}
        {!product.available && <span className="tag">unavailable</span>}
      </span>
      <span className="row-actions">
        <span className="move-pair">
          <button
            type="button"
            aria-label={`Move ${product.name} up in ${category.name}`}
            disabled={disabled || index === 0}
            onClick={() => onMove(-1)}
          >
            ↑
          </button>
          <button
            type="button"
            aria-label={`Move ${product.name} down in ${category.name}`}
            disabled={disabled || last}
            onClick={() => onMove(1)}
          >
            ↓
          </button>
        </span>
        <button type="button" disabled={disabled} onClick={onRemove}>
          Remove
        </button>
      </span>
    </li>
  );
}
