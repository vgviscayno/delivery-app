import {
  type CourierClient,
  deleteCategory,
  fetchDispatcherCatalog,
  reorderCategories,
  saveCategory,
  setCategoryProducts,
} from "@courier/api-client";
import type { Catalog as CatalogData, Category } from "@courier/domain";
import { Outlet } from "@tanstack/react-router";
import {
  createContext,
  type FormEvent,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { SubTabs } from "./SubTabs.js";
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
      <SubTabs
        label="Catalog sections"
        tabs={[
          { label: "Products", to: "/catalog/products" },
          { label: "Categories", to: "/catalog/categories" },
        ]}
      />
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
          <Outlet />
        </CatalogContext.Provider>
      )}
    </div>
  );
}

export function CategoriesSection() {
  const { client, catalog, onSaved } = useCatalog();
  const [name, setName] = useState("");
  const { busy, error, run } = useWrite(onSaved);
  const ids = catalog.categories.map((category) => category.id);

  async function add(event: FormEvent) {
    event.preventDefault();
    if (await run(() => saveCategory(client, null, name.trim()))) setName("");
  }

  return (
    <section aria-labelledby="categories-heading">
      <h2 id="categories-heading">Categories</h2>
      <p className="detail">
        How customers browse the catalog, in this order. A Product can be in several.
      </p>
      {catalog.categories.length === 0 ? (
        <p className="detail">No Categories yet.</p>
      ) : (
        <ol className="categories">
          {catalog.categories.map((category, index) => (
            <CategoryItem
              // A fresh item whenever the name changes, so its input starts from it.
              key={`${category.id}-${category.name}`}
              client={client}
              catalog={catalog}
              category={category}
              onSaved={onSaved}
              onMove={(by) =>
                void run(() => reorderCategories(client, moved(ids, index, by)))
              }
              first={index === 0}
              last={index === ids.length - 1}
              moving={busy}
            />
          ))}
        </ol>
      )}
      <Failure message={error} />
      <form onSubmit={add} className="closure-form">
        <input
          type="text"
          aria-label="New Category name"
          placeholder="New Category"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <button type="submit" disabled={busy}>
          Add Category
        </button>
      </form>
    </section>
  );
}

function CategoryItem({
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
  const memberIds = members.map((product) => product.id);
  const others = catalog.products.filter((product) => !memberIds.includes(product.id));

  const arrange = (productIds: readonly string[]) =>
    void run(() => setCategoryProducts(client, category.id, productIds));

  return (
    <li>
      <div className="category-heading">
        <input
          type="text"
          aria-label={`Name of ${category.name}`}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        {name.trim() !== category.name && (
          <button
            type="button"
            disabled={disabled || name.trim() === ""}
            onClick={() => void run(() => saveCategory(client, category.id, name.trim()))}
          >
            Rename
          </button>
        )}
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
        <button
          type="button"
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
      {members.length === 0 ? (
        <p className="detail">No Products in this Category.</p>
      ) : (
        <ol className="category-products">
          {members.map((product, index) => (
            <li key={product.id}>
              <span>{product.name}</span>
              {!product.available && <span className="detail">unavailable</span>}
              <button
                type="button"
                aria-label={`Move ${product.name} up in ${category.name}`}
                disabled={disabled || index === 0}
                onClick={() => arrange(moved(memberIds, index, -1))}
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={`Move ${product.name} down in ${category.name}`}
                disabled={disabled || index === members.length - 1}
                onClick={() => arrange(moved(memberIds, index, 1))}
              >
                ↓
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => arrange(memberIds.filter((id) => id !== product.id))}
              >
                Remove
              </button>
            </li>
          ))}
        </ol>
      )}
      {others.length > 0 && (
        <div className="closure-form">
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
              arrange([...memberIds, adding]);
              setAdding("");
            }}
          >
            Add
          </button>
        </div>
      )}
      <Failure message={error} />
    </li>
  );
}

/** The list with the item at `index` moved one place up (-1) or down (1). */
function moved(ids: readonly string[], index: number, by: -1 | 1): string[] {
  const next = [...ids];
  const [item] = next.splice(index, 1);
  if (item !== undefined) next.splice(index + by, 0, item);
  return next;
}
