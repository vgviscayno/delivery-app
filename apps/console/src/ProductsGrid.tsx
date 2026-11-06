import {
  type CourierClient,
  deleteProduct,
  saveProduct,
  setCategoryProducts,
  setProductAvailable,
} from "@courier/api-client";
import type { Category, PriceType } from "@courier/domain";
import { getRouteApi, useBlocker } from "@tanstack/react-router";
import {
  type ComponentProps,
  Fragment,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useCatalog } from "./Catalog.js";
import { Dialog } from "./Dialog.js";
import { applyResults, type GridWrites, type RowResult, saveDraft } from "./grid-save.js";
import {
  addRow,
  addToCategory,
  type CellMessages,
  changedFields,
  type Draft,
  type DraftRow,
  draftFromCatalog,
  duplicateRow,
  editRows,
  fillDown,
  fillDownTargets,
  type GridField,
  hasCell,
  isDirty,
  type RowValues,
  readRow,
  removeFromCategory,
  removeRows,
  syncDraft,
  visibleRows,
} from "./product-grid.js";
import type { ProductFilters } from "./products-search.js";
import { Failure, useWrite } from "./write.js";

const route = getRouteApi("/catalog/products");

/** The column labels and hints, shared by the grid's header and the side panel. */
const LABEL = {
  name: "Name",
  priceType: "Priced",
  price: "Price",
  step: "Ordered in",
  tolerance: "Weight tolerance",
  available: "Available",
  categoryIds: "Categories",
  photoUrl: "Photo",
  description: "Description",
} as const satisfies Record<GridField, string>;

const HINT = {
  step: "Customers order in steps of this, and at least one.",
  tolerance:
    "How far the packed weight may differ before the customer must approve the new price.",
} as const;

/** What follows each number cell, in the grid and the side panel alike. */
const UNIT = { step: "g steps", tolerance: "g" } as const;

const priceUnit = (type: PriceType) => (type === "per_unit" ? "each" : "/ kg");

const PRICE_TYPES: readonly { value: PriceType; label: string }[] = [
  { value: "per_unit", label: "Per unit" },
  { value: "per_weight", label: "Per weight" },
];

const PRODUCT_GONE = "That Product no longer exists.";

/** Navigating within the Products view (filters, the side panel) never asks. */
const leavesProducts = ({
  current,
  next,
}: {
  current: { pathname: string };
  next: { pathname: string };
}) => current.pathname !== next.pathname;

/**
 * The Catalog mode's Products view: one row per Product, edited like a spreadsheet.
 * Every edit is a local draft until Save, which writes each valid changed row on its own,
 * so one bad row never holds back the rest.
 */
export function ProductsSection() {
  const { client, catalog, onSaved } = useCatalog();
  const search = route.useSearch();
  const navigate = route.useNavigate();

  const [draft, setDraft] = useState<Draft>(() => draftFromCatalog(catalog));
  const [results, setResults] = useState<ReadonlyMap<string, RowResult>>(new Map());
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  /** A row never saved has no id for the URL, so the panel follows it here instead. */
  const [openUnsaved, setOpenUnsaved] = useState<string | null>(null);
  const [notice, setNotice] = useState<string>();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const saving = useWrite(onSaved);
  const deleting = useWrite(onSaved);
  const busy = saving.busy || deleting.busy;

  // Each read of the catalog — after Save, after Delete — is folded into the draft.
  useEffect(() => setDraft((current) => syncDraft(current, catalog)), [catalog]);

  // An id in the URL that is not in the catalog: an old link, or a Product deleted since.
  useEffect(() => {
    if (search.product && !catalog.products.some((each) => each.id === search.product)) {
      setNotice(PRODUCT_GONE);
      void navigate({ search: ({ product: _, ...rest }) => rest, replace: true });
    }
  }, [search.product, catalog, navigate]);

  const dirty = isDirty(draft);
  // In-app navigation asks in the page; a refresh or a closed tab gets the browser's own
  // prompt. Both only while there is something unsaved.
  const blocker = useBlocker({
    shouldBlockFn: leavesProducts,
    enableBeforeUnload: true,
    disabled: !dirty,
    withResolver: true,
  });

  const rows = visibleRows(draft, search);
  const open =
    draft.rows.find((row) =>
      openUnsaved !== null
        ? row.key === openUnsaved
        : search.product !== undefined && row.productId === search.product,
    ) ?? null;

  const edit = useCallback((key: string, edits: Partial<RowValues>) => {
    setDraft((current) => editRows(current, [key], edits));
    setResults((current) => withoutSettled(current, [key]));
  }, []);

  function openRow(row: DraftRow | null) {
    setNotice(undefined);
    setOpenUnsaved(row !== null && row.productId === null ? row.key : null);
    void navigate({
      search: ({ product: _, ...rest }) =>
        row?.productId ? { ...rest, product: row.productId } : rest,
    });
  }

  async function save() {
    let savedOpenId: string | null = null;
    const ok = await saving.run(async () => {
      const saved = await saveDraft(draft, catalog, writesFor(client));
      setDraft((current) => applyResults(current, saved));
      setResults(saved);
      if (openUnsaved !== null) savedOpenId = productIdOf(saved.get(openUnsaved));
    });
    // A new row open in the panel now has an id for the URL. Only once the catalog has
    // been read back, or the URL would name a Product the page has not heard of yet.
    if (ok && savedOpenId !== null) {
      const product = savedOpenId;
      setOpenUnsaved(null);
      void navigate({ search: (current) => ({ ...current, product }), replace: true });
    }
  }

  /** Deletes each ticked row on its own: those the server deletes go, even if some fail. */
  function deleteTicked() {
    setConfirmingDelete(false);
    const doomed = draft.rows.filter((row) => ticked.has(row.key));
    void deleting.run(async () => {
      const outcomes = await Promise.allSettled(
        doomed.map(async (row) => {
          if (row.productId !== null) await deleteProduct(client, row.productId);
        }),
      );
      const gone = doomed.filter((_, i) => outcomes[i]?.status === "fulfilled");
      const goneKeys = gone.map((row) => row.key);
      setDraft((current) => removeRows(current, goneKeys));
      setTicked((current) => toggled(current, goneKeys, false));
      if (open && goneKeys.includes(open.key)) openRow(null);
      const refused = outcomes.find((outcome) => outcome.status === "rejected");
      if (refused) throw refused.reason;
    });
  }

  const tickedKeys = [...ticked];
  const bulk = (change: (current: Draft) => Draft) => {
    setDraft(change);
    setResults((current) => withoutSettled(current, tickedKeys));
  };

  return (
    <section aria-labelledby="products-heading" className="products-view">
      <div className="products-main">
        <h2 id="products-heading">Products</h2>
        <p className="detail">
          What customers can order. Edits stay here until you press Save, and never change
          Orders already placed. Tab moves between cells, and Ctrl+D fills down: into the
          ticked rows below, or from the row above.
        </p>

        <Filters categories={catalog.categories} />

        <div className="grid-actions">
          <button type="button" data-tour="add-row" onClick={() => setDraft(addRow)}>
            Add row
          </button>
          <button
            type="button"
            data-tour="save"
            className="primary"
            disabled={!dirty || busy}
            onClick={() => void save()}
          >
            {saving.busy ? "Saving…" : "Save"}
          </button>
          {dirty && <span className="detail">Unsaved changes are highlighted.</span>}
        </div>

        <BulkBar
          count={ticked.size}
          deleting={deleting.busy}
          categories={catalog.categories}
          onAvailable={(available) =>
            bulk((current) => editRows(current, tickedKeys, { available }))
          }
          onAddTo={(id) => bulk((current) => addToCategory(current, tickedKeys, id))}
          onRemoveFrom={(id) =>
            bulk((current) => removeFromCategory(current, tickedKeys, id))
          }
          onDelete={() => setConfirmingDelete(true)}
        />

        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
        <Failure message={saving.error ?? deleting.error} />

        {rows.length === 0 ? (
          <p className="detail">
            {draft.rows.length === 0 ? "No Products yet." : "No Products match."}
          </p>
        ) : (
          <fieldset disabled={busy} className="grid-frame">
            <Grid
              rows={rows}
              categories={catalog.categories}
              results={results}
              ticked={ticked}
              openKey={open?.key ?? null}
              onTick={setTicked}
              onEdit={edit}
              onFillDown={(field, from, to) => {
                setDraft((current) => fillDown(current, field, from, to));
                setResults((current) => withoutSettled(current, to));
              }}
              onDuplicate={(key) => setDraft((current) => duplicateRow(current, key))}
              onOpen={openRow}
            />
          </fieldset>
        )}
      </div>

      {open && (
        <SidePanel
          // A fresh panel for each row, so it takes focus as it opens.
          key={open.key}
          row={open}
          messages={messages(open, results.get(open.key))}
          disabled={busy}
          onEdit={(edits) => edit(open.key, edits)}
          onClose={() => openRow(null)}
        />
      )}

      {confirmingDelete && (
        <Dialog
          title={`Delete ${plural(ticked.size, "Product")}?`}
          confirm="Delete"
          cancel="Keep them"
          onConfirm={deleteTicked}
          onCancel={() => setConfirmingDelete(false)}
        >
          <p>
            Customers will no longer see them. Orders already placed keep them. This
            cannot be undone.
          </p>
        </Dialog>
      )}

      {blocker.status === "blocked" && (
        <Dialog
          title="Leave without saving?"
          confirm="Leave without saving"
          cancel="Stay"
          onConfirm={blocker.proceed}
          onCancel={blocker.reset}
        >
          <p>Your changes to Products have not been saved, and will be lost.</p>
        </Dialog>
      )}
    </section>
  );
}

function Filters({ categories }: { categories: readonly Category[] }) {
  const search = route.useSearch();
  const navigate = route.useNavigate();
  /** Changes some filters, dropping any left empty from the URL. */
  const set = (
    changes: { [K in keyof ProductFilters]?: ProductFilters[K] | undefined },
  ) =>
    void navigate({
      search: (current) => {
        const next: Record<string, unknown> = { ...current, ...changes };
        for (const key of Object.keys(changes)) {
          if (!next[key]) delete next[key];
        }
        return next;
      },
      replace: true,
    });

  return (
    <div className="grid-filters">
      <input
        type="search"
        aria-label="Search by name"
        placeholder="Search by name"
        value={search.q ?? ""}
        onChange={(event) => set({ q: event.target.value })}
      />
      <select
        aria-label="Only this Category"
        value={search.category ?? ""}
        onChange={(event) => set({ category: event.target.value })}
      >
        <option value="">Every Category</option>
        <CategoryOptions categories={categories} />
      </select>
      <label>
        <input
          type="checkbox"
          checked={search.unavailable === 1}
          onChange={(event) =>
            set(event.target.checked ? { unavailable: 1 } : { unavailable: undefined })
          }
        />{" "}
        Unavailable only
      </label>
    </div>
  );
}

function BulkBar({
  count,
  deleting,
  categories,
  onAvailable,
  onAddTo,
  onRemoveFrom,
  onDelete,
}: {
  count: number;
  deleting: boolean;
  categories: readonly Category[];
  onAvailable: (available: boolean) => void;
  onAddTo: (categoryId: string) => void;
  onRemoveFrom: (categoryId: string) => void;
  onDelete: () => void;
}) {
  const none = count === 0;
  const categoryAction = (label: string, apply: (id: string) => void) => (
    <select
      aria-label={label}
      value=""
      disabled={none || categories.length === 0}
      onChange={(event) => {
        if (event.target.value) apply(event.target.value);
      }}
    >
      <option value="">{label}…</option>
      <CategoryOptions categories={categories} />
    </select>
  );

  return (
    <fieldset className="bulk-bar" data-tour="bulk-actions">
      <legend className="visually-hidden">Ticked rows</legend>
      <span className="detail">
        {none ? "Tick rows to change several at once." : `${plural(count, "row")} ticked`}
      </span>
      <button type="button" disabled={none} onClick={() => onAvailable(true)}>
        Mark available
      </button>
      <button type="button" disabled={none} onClick={() => onAvailable(false)}>
        Mark unavailable
      </button>
      {categoryAction("Add to Category", onAddTo)}
      {categoryAction("Remove from Category", onRemoveFrom)}
      <button
        type="button"
        className="danger"
        disabled={none || deleting}
        onClick={onDelete}
      >
        {deleting ? "Deleting…" : "Delete"}
      </button>
    </fieldset>
  );
}

function Grid({
  rows,
  categories,
  results,
  ticked,
  openKey,
  onTick,
  onEdit,
  onFillDown,
  onDuplicate,
  onOpen,
}: {
  rows: readonly DraftRow[];
  categories: readonly Category[];
  results: ReadonlyMap<string, RowResult>;
  ticked: ReadonlySet<string>;
  openKey: string | null;
  onTick: (ticked: ReadonlySet<string>) => void;
  onEdit: (key: string, edits: Partial<RowValues>) => void;
  onFillDown: (field: GridField, from: string, to: readonly string[]) => void;
  onDuplicate: (key: string) => void;
  onOpen: (row: DraftRow) => void;
}) {
  const allTicked = rows.every((row) => ticked.has(row.key));

  // Spreadsheet keys, read off the cell that has focus.
  function onKeyDown(event: KeyboardEvent<HTMLTableElement>) {
    const cell = (event.target as HTMLElement).closest<HTMLElement>("[data-field]");
    if (!cell) return;
    const field = cell.dataset.field as GridField;
    const index = Number(cell.dataset.row);

    if (event.key === "d" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      const fill = fillDownTargets(
        rows.map((row) => row.key),
        index,
        ticked,
      );
      if (fill) onFillDown(field, fill.from, fill.to);
    }
  }

  return (
    <table className="products-grid" aria-label="Products" onKeyDown={onKeyDown}>
      <thead data-tour="grid-header">
        <tr>
          <th scope="col">
            <input
              type="checkbox"
              aria-label="Tick every row shown"
              checked={allTicked}
              onChange={() =>
                onTick(
                  toggled(
                    ticked,
                    rows.map((row) => row.key),
                    !allTicked,
                  ),
                )
              }
            />
          </th>
          <th scope="col">{LABEL.name}</th>
          <th scope="col">{LABEL.priceType}</th>
          <th scope="col">{LABEL.price}</th>
          <HintedHeader field="step" />
          <HintedHeader field="tolerance" />
          <th scope="col">{LABEL.available}</th>
          <th scope="col">{LABEL.categoryIds}</th>
          <th scope="col">{LABEL.photoUrl}</th>
          <th scope="col">
            <span className="visually-hidden">Actions</span>
          </th>
          <th scope="col">
            <span className="visually-hidden">Result</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <GridRow
            key={row.key}
            row={row}
            index={index}
            categories={categories}
            result={results.get(row.key)}
            ticked={ticked.has(row.key)}
            open={row.key === openKey}
            onTick={(on) => onTick(toggled(ticked, [row.key], on))}
            onEdit={(edits) => onEdit(row.key, edits)}
            onDuplicate={() => onDuplicate(row.key)}
            onOpen={() => onOpen(row)}
          />
        ))}
      </tbody>
    </table>
  );
}

function HintedHeader({ field }: { field: "step" | "tolerance" }) {
  return (
    <th scope="col">
      {LABEL[field]}
      <span className="hint">{HINT[field]}</span>
    </th>
  );
}

function GridRow({
  row,
  index,
  categories,
  result,
  ticked,
  open,
  onTick,
  onEdit,
  onDuplicate,
  onOpen,
}: {
  row: DraftRow;
  index: number;
  categories: readonly Category[];
  result: RowResult | undefined;
  ticked: boolean;
  open: boolean;
  onTick: (ticked: boolean) => void;
  onEdit: (edits: Partial<RowValues>) => void;
  onDuplicate: () => void;
  onOpen: () => void;
}) {
  const { values } = row;
  const title = rowTitle(row);
  const changed = changedFields(row);
  const { errors, warnings } = messages(row, result);

  /** A cell with its highlight, and the message about it underneath. */
  const cell = (field: GridField, content: ReactNode) => (
    <td
      className={changed.includes(field) ? "changed" : undefined}
      data-invalid={errors[field] ? true : undefined}
    >
      {content}
      {errors[field] ? (
        <span className="notice cell-message">{errors[field]}</span>
      ) : (
        warnings[field] && <span className="warning cell-message">{warnings[field]}</span>
      )}
    </td>
  );

  /** What every cell's control carries: where it is, for Ctrl+D, and its name. */
  const cellProps = (field: GridField) => ({
    "data-row": index,
    "data-field": field,
    "aria-label": `${LABEL[field]} of ${title}`,
    "aria-invalid": errors[field] ? true : undefined,
  });

  return (
    <tr
      aria-label={title}
      className={row.saved === null ? "new" : undefined}
      data-selected={open || undefined}
    >
      <td>
        <input
          type="checkbox"
          aria-label={`Tick ${title}`}
          checked={ticked}
          onChange={(event) => onTick(event.target.checked)}
        />
      </td>
      {cell(
        "name",
        <input
          {...cellProps("name")}
          type="text"
          value={values.name}
          onChange={(event) => onEdit({ name: event.target.value })}
        />,
      )}
      {cell(
        "priceType",
        <PriceTypeSelect
          {...cellProps("priceType")}
          value={values.priceType}
          onChange={(priceType) => onEdit({ priceType })}
        />,
      )}
      {cell(
        "price",
        <PriceInput
          {...cellProps("price")}
          priceType={values.priceType}
          value={values.price}
          onChange={(price) => onEdit({ price })}
        />,
      )}
      {(["step", "tolerance"] as const).map((field) =>
        hasCell(values, field) ? (
          <Fragment key={field}>
            {cell(
              field,
              <GramsInput
                {...cellProps(field)}
                field={field}
                value={values[field]}
                onChange={(grams) => onEdit({ [field]: grams })}
              />,
            )}
          </Fragment>
        ) : (
          <td key={field} className="not-applicable">
            —
          </td>
        ),
      )}
      {cell(
        "available",
        <input
          {...cellProps("available")}
          type="checkbox"
          checked={values.available}
          onChange={(event) => onEdit({ available: event.target.checked })}
        />,
      )}
      {cell(
        "categoryIds",
        <CategoryPicker
          {...cellProps("categoryIds")}
          categories={categories}
          chosen={values.categoryIds}
          onChange={(categoryIds) => onEdit({ categoryIds })}
        />,
      )}
      <td>
        {values.photoUrl ? (
          <img className="thumb" src={values.photoUrl} alt={title} />
        ) : (
          <span className="detail">No photo</span>
        )}
      </td>
      <td className="row-actions">
        <button type="button" aria-label={`Details of ${title}`} onClick={onOpen}>
          Details
        </button>
        <button type="button" aria-label={`Duplicate ${title}`} onClick={onDuplicate}>
          Duplicate
        </button>
      </td>
      <td>
        <RowStatus result={result} errors={errors} />
      </td>
    </tr>
  );
}

function RowStatus({
  result,
  errors,
}: {
  result: RowResult | undefined;
  errors: CellMessages;
}) {
  if (!result) return null;
  if (result.status === "saved") return <span className="saved">Saved</span>;
  if (result.status === "failed") {
    return <span className="notice">Not saved: {result.message}</span>;
  }
  if (result.status === "categoriesFailed") {
    return (
      <span className="notice">Saved, but its Categories were not: {result.message}</span>
    );
  }
  return Object.keys(errors).length > 0 ? (
    <span className="notice">Not saved: fix the marked cells</span>
  ) : null;
}

function PriceTypeSelect({
  value,
  onChange,
  ...select
}: {
  value: PriceType;
  onChange: (priceType: PriceType) => void;
} & Omit<ComponentProps<"select">, "value" | "onChange">) {
  return (
    <select
      {...select}
      value={value}
      onChange={(event) => onChange(event.target.value as PriceType)}
    >
      {PRICE_TYPES.map((type) => (
        <option key={type.value} value={type.value}>
          {type.label}
        </option>
      ))}
    </select>
  );
}

type TextInputProps = {
  value: string;
  onChange: (value: string) => void;
} & Omit<ComponentProps<"input">, "value" | "onChange">;

/** The price, between "₱" and "each" or "/ kg", so it reads as it will be shown. */
function PriceInput({
  priceType,
  value,
  onChange,
  ...input
}: TextInputProps & { priceType: PriceType }) {
  return (
    <span className="affixed">
      ₱
      <input
        {...input}
        type="text"
        inputMode="decimal"
        size={8}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <span>{priceUnit(priceType)}</span>
    </span>
  );
}

/** A step or a tolerance, in grams: "250 g steps", "±30 g". */
function GramsInput({
  field,
  value,
  onChange,
  ...input
}: TextInputProps & { field: "step" | "tolerance" }) {
  return (
    <span className="affixed">
      {field === "tolerance" && "±"}
      <input
        {...input}
        type="text"
        inputMode="numeric"
        size={5}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <span>{UNIT[field]}</span>
    </span>
  );
}

function CategoryOptions({ categories }: { categories: readonly Category[] }) {
  return categories.map((category) => (
    <option key={category.id} value={category.id}>
      {category.name}
    </option>
  ));
}

/**
 * A multi-select of Categories that fits in a cell: the chosen ones as its summary, a
 * tick box per Category when opened.
 */
function CategoryPicker({
  categories,
  chosen,
  onChange,
  ...cell
}: {
  categories: readonly Category[];
  chosen: readonly string[];
  onChange: (chosen: readonly string[]) => void;
  "data-row": number;
  "data-field": GridField;
  "aria-label": string;
}) {
  const names = categories
    .filter((category) => chosen.includes(category.id))
    .map((category) => category.name);

  return (
    <details className="category-picker">
      <summary {...cell}>{names.length > 0 ? names.join(", ") : "None"}</summary>
      <div className="category-options">
        {categories.length === 0 && <span className="detail">No Categories yet.</span>}
        {categories.map((category) => (
          <label key={category.id}>
            <input
              type="checkbox"
              checked={chosen.includes(category.id)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...chosen, category.id]
                    : chosen.filter((id) => id !== category.id),
                )
              }
            />{" "}
            {category.name}
          </label>
        ))}
      </div>
    </details>
  );
}

/**
 * The open row in full, docked beside the grid: the long description, and the same cells
 * under the same labels, hints and units. It edits the same draft as the grid.
 */
function SidePanel({
  row,
  messages: { errors, warnings },
  disabled,
  onEdit,
  onClose,
}: {
  row: DraftRow;
  messages: { errors: CellMessages; warnings: CellMessages };
  disabled: boolean;
  onEdit: (edits: Partial<RowValues>) => void;
  onClose: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const { values } = row;
  const title = rowTitle(row);
  const changed = changedFields(row);

  /** A control under the same label as its column, with its error, warning or hint. */
  const field = (name: GridField, control: (id: string) => ReactNode, hint?: string) => {
    const id = `side-panel-${name}`;
    const message = errors[name] ?? warnings[name];
    return (
      <div className={`panel-field${changed.includes(name) ? " changed" : ""}`}>
        <label htmlFor={id}>{LABEL[name]}</label>
        {control(id)}
        {message ? (
          <span className={errors[name] ? "notice" : "warning"}>{message}</span>
        ) : (
          hint && <span className="detail">{hint}</span>
        )}
      </div>
    );
  };

  return (
    <aside
      className="side-panel"
      aria-labelledby="side-panel-heading"
      data-tour="side-panel"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <div className="side-panel-heading">
        <h3 id="side-panel-heading" ref={heading} tabIndex={-1}>
          {title}
        </h3>
        <button type="button" aria-label="Close the details" onClick={onClose}>
          ×
        </button>
      </div>
      {values.photoUrl && (
        <img className="panel-photo" src={values.photoUrl} alt={title} />
      )}
      <fieldset disabled={disabled}>
        {field("name", (id) => (
          <input
            id={id}
            type="text"
            value={values.name}
            onChange={(event) => onEdit({ name: event.target.value })}
          />
        ))}
        {field("priceType", (id) => (
          <PriceTypeSelect
            id={id}
            value={values.priceType}
            onChange={(priceType) => onEdit({ priceType })}
          />
        ))}
        {field("price", (id) => (
          <PriceInput
            id={id}
            priceType={values.priceType}
            value={values.price}
            onChange={(price) => onEdit({ price })}
          />
        ))}
        {hasCell(values, "step") ? (
          (["step", "tolerance"] as const).map((name) => (
            <Fragment key={name}>
              {field(
                name,
                (id) => (
                  <GramsInput
                    id={id}
                    field={name}
                    value={values[name]}
                    onChange={(grams) => onEdit({ [name]: grams })}
                  />
                ),
                HINT[name],
              )}
            </Fragment>
          ))
        ) : (
          <p className="detail">
            {LABEL.step}: — · {LABEL.tolerance}: —
          </p>
        )}
        {field(
          "description",
          (id) => (
            <textarea
              id={id}
              rows={6}
              value={values.description}
              onChange={(event) => onEdit({ description: event.target.value })}
            />
          ),
          "Optional. Shown to customers with the Product.",
        )}
      </fieldset>
    </aside>
  );
}

/**
 * Errors show on a row once Save has refused it, and follow its cells as they are fixed.
 * Warnings show as soon as they apply.
 */
function messages(
  row: DraftRow,
  result: RowResult | undefined,
): { errors: CellMessages; warnings: CellMessages } {
  const read = readRow(row);
  if (read.ok) return { errors: {}, warnings: read.warnings };
  return { errors: result?.status === "invalid" ? read.errors : {}, warnings: {} };
}

/** Drops the saved and failed results of rows edited since, keeping "fix these" ones. */
function withoutSettled(
  results: ReadonlyMap<string, RowResult>,
  keys: readonly string[],
): ReadonlyMap<string, RowResult> {
  if (!keys.some((key) => results.has(key))) return results;
  const next = new Map(results);
  for (const key of keys) {
    if (next.get(key)?.status !== "invalid") next.delete(key);
  }
  return next;
}

/** The ticked rows, with these rows ticked or unticked. */
function toggled(
  ticked: ReadonlySet<string>,
  keys: readonly string[],
  on: boolean,
): ReadonlySet<string> {
  const next = new Set(ticked);
  for (const key of keys) {
    if (on) next.add(key);
    else next.delete(key);
  }
  return next;
}

/** The Product a row's Save left it tied to, if Save got as far as making one. */
function productIdOf(result: RowResult | undefined): string | null {
  return result && result.status !== "invalid" ? result.productId : null;
}

/** What a row is called in labels: its saved name, so a label holds still while typing. */
function rowTitle(row: DraftRow): string {
  return row.saved?.name || row.values.name.trim() || "New Product";
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function writesFor(client: CourierClient): GridWrites {
  return {
    saveProduct: (id, edits) => saveProduct(client, id, edits),
    setProductAvailable: (id, available) => setProductAvailable(client, id, available),
    setCategoryProducts: (categoryId, productIds) =>
      setCategoryProducts(client, categoryId, productIds),
  };
}
