import {
  type CourierClient,
  deleteCategory,
  deleteProduct,
  fetchDispatcherCatalog,
  reorderCategories,
  saveCategory,
  saveProduct,
  setCategoryProducts,
  setProductAvailable,
} from "@courier/api-client";
import type { Catalog as CatalogData, Category, Price, Product } from "@courier/domain";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import {
  formFromProduct,
  type ProductForm,
  type ProductFormMessages,
  readProductForm,
} from "./product-form.js";
import { Failure, messageOf, useWrite } from "./write.js";

type Load =
  | { readonly state: "loading" }
  | { readonly state: "ready"; readonly catalog: CatalogData }
  | { readonly state: "error"; readonly message: string };

/** Which Product is open in the editor: a new one, an existing one, or none. */
type Editing = { readonly product: Product | null } | null;

/**
 * The catalog on the settings surface: Products of both price types, and the Categories
 * customers browse them by. Like the rest of the surface, every change is read back from
 * the server afterwards.
 */
export function Catalog({ client }: { client: CourierClient }) {
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

  if (load.state === "loading") return <p className="detail">Loading the catalog…</p>;
  if (load.state === "error") {
    return (
      <p className="notice" role="alert">
        {load.message}
      </p>
    );
  }

  return (
    <>
      <ProductsSection client={client} catalog={load.catalog} onSaved={reload} />
      <CategoriesSection client={client} catalog={load.catalog} onSaved={reload} />
    </>
  );
}

interface SectionProps {
  readonly client: CourierClient;
  readonly catalog: CatalogData;
  readonly onSaved: () => Promise<void>;
}

function ProductsSection({ client, catalog, onSaved }: SectionProps) {
  const [editing, setEditing] = useState<Editing>(null);
  const { busy, error, run } = useWrite(onSaved);

  return (
    <section aria-labelledby="products-heading">
      <h2 id="products-heading">Products</h2>
      <p className="detail">
        What customers can order. Edits never change Orders already placed.
      </p>
      {catalog.products.length === 0 ? (
        <p className="detail">No Products yet.</p>
      ) : (
        <table className="catalog-products">
          <tbody>
            {catalog.products.map((product) => (
              <tr key={product.id}>
                <th scope="row">{product.name}</th>
                <td>{describePrice(product.price)}</td>
                <td>
                  <label>
                    <input
                      type="checkbox"
                      checked={product.available}
                      disabled={busy}
                      onChange={(event) => {
                        const available = event.target.checked;
                        void run(() =>
                          setProductAvailable(client, product.id, available),
                        );
                      }}
                    />{" "}
                    Available
                  </label>
                </td>
                <td>
                  <button type="button" onClick={() => setEditing({ product })}>
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(`Delete ${product.name}? This cannot be undone.`)
                      ) {
                        void run(() => deleteProduct(client, product.id));
                      }
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Failure message={error} />
      {editing ? (
        <ProductEditor
          // A fresh editor for each Product, so its fields start from that Product.
          key={editing.product?.id ?? "new"}
          client={client}
          product={editing.product}
          onClose={() => setEditing(null)}
          onSaved={onSaved}
        />
      ) : (
        <button type="button" onClick={() => setEditing({ product: null })}>
          Add a Product
        </button>
      )}
    </section>
  );
}

function ProductEditor({
  client,
  product,
  onClose,
  onSaved,
}: {
  client: CourierClient;
  product: Product | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState<ProductForm>(() => formFromProduct(product));
  const [errors, setErrors] = useState<ProductFormMessages>({});
  const { busy, error, run } = useWrite(onSaved);

  // Warnings follow the form as it is typed, so the dispatcher sees them before saving.
  const read = readProductForm(form);
  const warnings = read.ok ? read.warnings : {};

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!read.ok) {
      setErrors(read.errors);
      return;
    }
    setErrors({});
    if (await run(() => saveProduct(client, product?.id ?? null, read.edits))) onClose();
  }

  const field = (
    name: keyof ProductForm,
    label: string,
    input: React.InputHTMLAttributes<HTMLInputElement>,
    hint?: string,
  ) => (
    <label>
      <span>{label}</span>
      <input
        {...input}
        value={form[name]}
        aria-invalid={errors[name] ? true : undefined}
        onChange={(event) => setForm({ ...form, [name]: event.target.value })}
      />
      {errors[name] ? (
        <span className="notice">{errors[name]}</span>
      ) : warnings[name] ? (
        <span className="warning">{warnings[name]}</span>
      ) : (
        hint && <span className="detail">{hint}</span>
      )}
    </label>
  );

  return (
    <form onSubmit={submit} className="settings-form product-editor">
      <h3>{product ? `Edit ${product.name}` : "New Product"}</h3>
      {field("name", "Name", { required: true })}
      {field("description", "Description", {}, "Optional.")}
      {field("photoUrl", "Photo URL", { type: "url" }, "Optional. https://…")}
      <fieldset>
        <legend>Priced</legend>
        <label>
          <input
            type="radio"
            name="price-type"
            checked={form.priceType === "per_unit"}
            onChange={() => setForm({ ...form, priceType: "per_unit" })}
          />{" "}
          Per unit
        </label>
        <label>
          <input
            type="radio"
            name="price-type"
            checked={form.priceType === "per_weight"}
            onChange={() => setForm({ ...form, priceType: "per_weight" })}
          />{" "}
          Per weight
        </label>
      </fieldset>
      {form.priceType === "per_unit" ? (
        field("unitPricePesos", "Price (₱)", { inputMode: "decimal", required: true })
      ) : (
        <>
          {field("pricePerKgPesos", "Rate (₱ per kg)", {
            inputMode: "decimal",
            required: true,
          })}
          {field(
            "weightStepGrams",
            "Step (g)",
            { inputMode: "numeric", required: true },
            "Customers order in steps of this, and at least one.",
          )}
          {field(
            "toleranceGrams",
            "Tolerance (g)",
            { inputMode: "numeric" },
            "Packed this far from the estimate, either way, without a call. 250 if blank.",
          )}
        </>
      )}
      <div className="actions">
        <button type="submit" disabled={busy}>
          {busy ? "Saving…" : product ? "Save Product" : "Add Product"}
        </button>
        <button type="button" onClick={onClose}>
          Cancel
        </button>
        <Failure message={error} />
      </div>
    </form>
  );
}

function CategoriesSection({ client, catalog, onSaved }: SectionProps) {
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

const PESOS = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

function describePrice(price: Price): string {
  if (price.type === "per_unit") return PESOS.format(price.unitPriceCentavos / 100);
  return (
    `${PESOS.format(price.pricePerKgCentavos / 100)} per kg · ` +
    `in ${price.weightStepGrams} g steps · ±${price.toleranceGrams} g`
  );
}
