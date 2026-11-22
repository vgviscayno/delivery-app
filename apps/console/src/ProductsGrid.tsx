import {
  type CourierClient,
  deleteProduct,
  productPhotoUrls,
  removeProductPhoto,
  saveProduct,
  setCategoryProducts,
  setProductAvailable,
  uploadProductPhoto,
} from "@courier/api-client";
import type { Category, PriceType } from "@courier/domain";
import { getRouteApi, useBlocker } from "@tanstack/react-router";
import {
  type Column,
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  type OnChangeFn,
  type RowSelectionState,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import {
  type ComponentProps,
  type CSSProperties,
  Fragment,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useCatalog } from "./Catalog.js";
import { Dialog } from "./Dialog.js";
import { applyResults, type GridWrites, type RowResult, saveDraft } from "./grid-save.js";
import { resizePhoto } from "./photo-resize.js";
import {
  addRow,
  addToCategory,
  addTourRow,
  type CellMessages,
  changedFields,
  type Draft,
  type DraftRow,
  draftFromCatalog,
  droppedPhoto,
  duplicateRow,
  editRows,
  fillDown,
  fillDownTargets,
  type GridField,
  hasCell,
  isDirty,
  type RowPhoto,
  type RowValues,
  readRow,
  removeFromCategory,
  removeRows,
  sortRows,
  storedPath,
  syncDraft,
  TOUR_ROW_KEY,
  visibleRows,
  withoutTourRow,
} from "./product-grid.js";
import type { ProductFilters, ProductsSort, SortColumn } from "./products-search.js";
import { useTour } from "./Tour.js";
import { TOUR_ROW } from "./tours.js";
import { Failure, useWrite } from "./write.js";

const route = getRouteApi("/catalog/products");

const LABEL = {
  name: "Name",
  priceType: "Priced",
  price: "Price",
  step: "Ordered in",
  tolerance: "Weight tolerance",
  available: "Available",
  categoryIds: "Categories",
  photo: "Photo",
  description: "Description",
} as const satisfies Record<GridField, string>;

const HINT = {
  step: "Customers order in steps of this, and at least one. E.g. 250 g: customers can order 250 g, 500 g, 750 g…",
  tolerance:
    "How far the packed weight may differ before the customer must approve the new price. E.g. ±30 g on a 500 g order: 470–530 g goes through as is; 540 g needs the customer's approval.",
} as const;

const UNIT = { step: "g steps", tolerance: "g" } as const;

const priceUnit = (type: PriceType) => (type === "per_unit" ? "each" : "/ kg");

const PRICE_TYPES: readonly { value: PriceType; label: string }[] = [
  { value: "per_unit", label: "Per unit" },
  { value: "per_weight", label: "Per weight" },
];

const PRODUCT_GONE = "That Product no longer exists.";

const leavesProducts = ({
  current,
  next,
}: {
  current: { pathname: string };
  next: { pathname: string };
}) => current.pathname !== next.pathname;

export function ProductsSection() {
  const { client, catalog, onSaved } = useCatalog();
  const search = route.useSearch();
  const navigate = route.useNavigate();

  const [draft, setDraft] = useState<Draft>(() => draftFromCatalog(catalog));
  const [results, setResults] = useState<ReadonlyMap<string, RowResult>>(new Map());
  const [ticked, setTicked] = useState<RowSelectionState>({});
  const [openUnsaved, setOpenUnsaved] = useState<string | null>(null);
  const [notice, setNotice] = useState<string>();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const saving = useWrite(onSaved);
  const deleting = useWrite(onSaved);
  const busy = saving.busy || deleting.busy;
  const [tourDetails, setTourDetails] = useState(false);
  useTour("products", {
    onStart: () => setDraft(addTourRow),
    onEnd: () => {
      setDraft(withoutTourRow);
      setTicked(({ [TOUR_ROW_KEY]: _, ...rest }) => rest);
    },
    onDetails: setTourDetails,
  });

  const previews = useRef(new Set<string>());
  useEffect(() => {
    const held = new Set(
      draft.rows.flatMap(({ values }) => droppedPhoto(values.photo)?.preview ?? []),
    );
    for (const url of previews.current) {
      if (!held.has(url)) URL.revokeObjectURL(url);
    }
    previews.current = held;
  }, [draft]);
  useEffect(
    () => () => {
      for (const url of previews.current) URL.revokeObjectURL(url);
    },
    [],
  );

  const photoSrc = (photo: RowPhoto | null, size: "large" | "thumb") => {
    const path = storedPath(photo);
    return path
      ? productPhotoUrls(client, path)[size]
      : (droppedPhoto(photo)?.preview ?? null);
  };

  useEffect(() => setDraft((current) => syncDraft(current, catalog)), [catalog]);

  useEffect(() => {
    if (search.product && !catalog.products.some((each) => each.id === search.product)) {
      setNotice(PRODUCT_GONE);
      void navigate({ search: ({ product: _, ...rest }) => rest, replace: true });
    }
  }, [search.product, catalog, navigate]);

  const ownDraft = withoutTourRow(draft);
  const dirty = isDirty(ownDraft);
  const blocker = useBlocker({
    shouldBlockFn: leavesProducts,
    enableBeforeUnload: true,
    disabled: !dirty,
    withResolver: true,
  });

  const rows = sortRows(visibleRows(draft, search), search.sort);
  const open =
    draft.rows.find((row) =>
      tourDetails
        ? row.key === TOUR_ROW_KEY
        : openUnsaved !== null
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
      const saved = await saveDraft(ownDraft, catalog, writesFor(client));
      setDraft((current) => applyResults(current, saved));
      setResults(saved);
      if (openUnsaved !== null) savedOpenId = productIdOf(saved.get(openUnsaved));
    });
    if (ok && savedOpenId !== null) {
      const product = savedOpenId;
      setOpenUnsaved(null);
      void navigate({ search: (current) => ({ ...current, product }), replace: true });
    }
  }

  function deleteTicked() {
    setConfirmingDelete(false);
    const doomed = draft.rows.filter((row) => tickedRows.includes(row.key));
    void deleting.run(async () => {
      const outcomes = await Promise.allSettled(
        doomed.map(async (row) => {
          if (row.productId !== null) await deleteProduct(client, row.productId);
        }),
      );
      const gone = doomed.filter((_, i) => outcomes[i]?.status === "fulfilled");
      const goneKeys = gone.map((row) => row.key);
      setDraft((current) => removeRows(current, goneKeys));
      setTicked((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([key]) => !goneKeys.includes(key)),
        ),
      );
      if (open && goneKeys.includes(open.key)) openRow(null);
      const refused = outcomes.find((outcome) => outcome.status === "rejected");
      if (refused) throw refused.reason;
    });
  }

  const tickedRows = tickedKeys(ticked).filter((key) => key !== TOUR_ROW_KEY);
  const bulk = (change: (current: Draft) => Draft) => {
    setDraft(change);
    setResults((current) => withoutSettled(current, tickedRows));
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
          count={tickedRows.length}
          deleting={deleting.busy}
          categories={catalog.categories}
          onAvailable={(available) =>
            bulk((current) => editRows(current, tickedRows, { available }))
          }
          onAddTo={(id) => bulk((current) => addToCategory(current, tickedRows, id))}
          onRemoveFrom={(id) =>
            bulk((current) => removeFromCategory(current, tickedRows, id))
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
              thumbOf={(photo) => photoSrc(photo, "thumb")}
              results={results}
              ticked={ticked}
              sort={search.sort}
              openKey={open?.key ?? null}
              onTick={setTicked}
              onSort={(sort) =>
                void navigate({
                  search: ({ sort: _, ...rest }) => (sort ? { ...rest, sort } : rest),
                  replace: true,
                })
              }
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
          key={open.key}
          row={open}
          photo={photoSrc(open.values.photo, "large")}
          messages={messages(open, results.get(open.key))}
          disabled={busy}
          takeFocus={!tourDetails}
          onEdit={(edits) => edit(open.key, edits)}
          onClose={() => openRow(null)}
        />
      )}

      {confirmingDelete && (
        <Dialog
          title={`Delete ${plural(tickedRows.length, "Product")}?`}
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
      <label>
        <input
          type="checkbox"
          checked={search.nophoto === 1}
          onChange={(event) =>
            set(event.target.checked ? { nophoto: 1 } : { nophoto: undefined })
          }
        />{" "}
        No photo
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

interface RowView {
  readonly row: DraftRow;
  readonly index: number;
  readonly title: string;
  readonly changed: readonly GridField[];
  readonly errors: CellMessages;
  readonly warnings: CellMessages;
  readonly result: RowResult | undefined;
  readonly categories: readonly Category[];
  readonly thumb: string | null;
  readonly onEdit: (edits: Partial<RowValues>) => void;
  readonly onDuplicate: () => void;
  readonly onOpen: () => void;
}

const rem = (size: number) => size * 16;

const VALUE_CELLS: ReadonlySet<string> = new Set<GridField>([
  "name",
  "priceType",
  "price",
  "step",
  "tolerance",
  "available",
  "categoryIds",
  "photo",
]);

const cellProps = (view: RowView, field: GridField) => ({
  "data-row": view.index,
  "data-field": field,
  "aria-label": `${LABEL[field]} of ${view.title}`,
  "aria-invalid": view.errors[field] ? true : undefined,
});

const sortable = (
  field: SortColumn,
  def: Omit<ColumnDef<RowView, unknown>, "id">,
): ColumnDef<RowView, unknown> => ({
  id: field,
  accessorFn: (view) => view.row.saved?.[field],
  header: ({ column }) => <SortButton column={column} field={field} />,
  ...def,
});

const GRAMS_CELL = (field: "step" | "tolerance"): ColumnDef<RowView, unknown> =>
  sortable(field, {
    size: rem(8),
    header: ({ column }) => (
      <>
        <SortButton column={column} field={field} /> <HintTip field={field} />
      </>
    ),
    cell: ({ row: { original: view } }) =>
      hasCell(view.row.values, field) ? (
        <GramsInput
          {...cellProps(view, field)}
          field={field}
          value={view.row.values[field]}
          onChange={(grams) => view.onEdit({ [field]: grams })}
        />
      ) : (
        "—"
      ),
  });

const COLUMNS: ColumnDef<RowView, unknown>[] = [
  {
    id: "tick",
    header: ({ table }) => (
      <input
        type="checkbox"
        aria-label="Tick every row shown"
        checked={table.getIsAllRowsSelected()}
        onChange={table.getToggleAllRowsSelectedHandler()}
      />
    ),
    cell: ({ row }) => (
      <input
        type="checkbox"
        aria-label={`Tick ${row.original.title}`}
        checked={row.getIsSelected()}
        onChange={row.getToggleSelectedHandler()}
      />
    ),
  },
  sortable("name", {
    size: rem(18),
    minSize: rem(14),
    maxSize: rem(22),
    cell: ({ row: { original: view } }) => (
      <NameInput
        {...cellProps(view, "name")}
        value={view.row.values.name}
        onChange={(name) => view.onEdit({ name })}
      />
    ),
  }),
  sortable("priceType", {
    cell: ({ row: { original: view } }) => (
      <PriceTypeSelect
        {...cellProps(view, "priceType")}
        value={view.row.values.priceType}
        onChange={(priceType) => view.onEdit({ priceType })}
      />
    ),
  }),
  sortable("price", {
    size: rem(10),
    cell: ({ row: { original: view } }) => (
      <PriceInput
        {...cellProps(view, "price")}
        priceType={view.row.values.priceType}
        value={view.row.values.price}
        onChange={(price) => view.onEdit({ price })}
      />
    ),
  }),
  GRAMS_CELL("step"),
  GRAMS_CELL("tolerance"),
  sortable("available", {
    cell: ({ row: { original: view } }) => (
      <input
        {...cellProps(view, "available")}
        type="checkbox"
        checked={view.row.values.available}
        onChange={(event) => view.onEdit({ available: event.target.checked })}
      />
    ),
  }),
  {
    id: "categoryIds",
    size: rem(12),
    header: LABEL.categoryIds,
    cell: ({ row: { original: view } }) => (
      <CategoryPicker
        {...cellProps(view, "categoryIds")}
        categories={view.categories}
        chosen={view.row.values.categoryIds}
        onChange={(categoryIds) => view.onEdit({ categoryIds })}
      />
    ),
  },
  {
    id: "photo",
    header: LABEL.photo,
    cell: ({ row: { original: view } }) => <PhotoCell view={view} />,
  },
  {
    id: "actions",
    header: () => <span className="visually-hidden">Actions</span>,
    cell: ({ row: { original: view } }) => (
      <>
        <button
          type="button"
          aria-label={`Details of ${view.title}`}
          onClick={view.onOpen}
        >
          Details
        </button>
        <button
          type="button"
          aria-label={`Duplicate ${view.title}`}
          data-tour={view.row.key === TOUR_ROW_KEY ? "duplicate" : undefined}
          onClick={view.onDuplicate}
        >
          Duplicate
        </button>
      </>
    ),
  },
  {
    id: "result",
    header: () => <span className="visually-hidden">Result</span>,
    cell: ({ row: { original: view } }) => (
      <RowStatus result={view.result} errors={view.errors} />
    ),
  },
];

function widths(def: ColumnDef<RowView, unknown>): CSSProperties {
  return {
    ...(def.size !== undefined && { width: def.size }),
    ...(def.minSize !== undefined && { minWidth: def.minSize }),
    ...(def.maxSize !== undefined && { maxWidth: def.maxSize }),
  };
}

const ARIA_SORT = { asc: "ascending", desc: "descending" } as const;

function Grid({
  rows,
  categories,
  results,
  ticked,
  sort,
  openKey,
  onTick,
  onSort,
  onEdit,
  onFillDown,
  onDuplicate,
  onOpen,
  thumbOf,
}: {
  rows: readonly DraftRow[];
  categories: readonly Category[];
  thumbOf: (photo: RowPhoto | null) => string | null;
  results: ReadonlyMap<string, RowResult>;
  ticked: RowSelectionState;
  sort: ProductsSort | undefined;
  openKey: string | null;
  onTick: OnChangeFn<RowSelectionState>;
  onSort: (sort: ProductsSort | undefined) => void;
  onEdit: (key: string, edits: Partial<RowValues>) => void;
  onFillDown: (field: GridField, from: string, to: readonly string[]) => void;
  onDuplicate: (key: string) => void;
  onOpen: (row: DraftRow) => void;
}) {
  const data = rows.map((row, index): RowView => {
    const result = results.get(row.key);
    return {
      row,
      index,
      title: rowTitle(row),
      changed: changedFields(row),
      ...messages(row, result),
      result,
      categories,
      thumb: thumbOf(row.values.photo),
      onEdit: (edits) => onEdit(row.key, edits),
      onDuplicate: () => onDuplicate(row.key),
      onOpen: () => onOpen(row),
    };
  });

  const sorting: SortingState = sort
    ? [{ id: sort.replace(/^-/, ""), desc: sort.startsWith("-") }]
    : [];

  const table = useReactTable({
    data,
    columns: COLUMNS,
    getRowId: (view) => view.row.key,
    getCoreRowModel: getCoreRowModel(),
    state: { sorting, rowSelection: ticked },
    onRowSelectionChange: onTick,
    manualSorting: true,
    autoResetAll: false,
    sortDescFirst: false,
    enableMultiSort: false,
    onSortingChange: (change) => {
      const [next] = typeof change === "function" ? change(sorting) : change;
      onSort(next && ((next.desc ? `-${next.id}` : next.id) as ProductsSort));
    },
  });

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
        new Set(tickedKeys(ticked)),
      );
      if (fill) onFillDown(field, fill.from, fill.to);
    }
  }

  return (
    <table className="products-grid" aria-label="Products" onKeyDown={onKeyDown}>
      <thead>
        {table.getHeaderGroups().map((group) => (
          <tr key={group.id}>
            {group.headers.map((header) => {
              const sorted = header.column.getIsSorted();
              return (
                <th
                  key={header.id}
                  scope="col"
                  className={`col-${header.column.id}`}
                  data-tour={`column-${header.column.id}`}
                  style={widths(header.column.columnDef)}
                  aria-sort={sorted ? ARIA_SORT[sorted] : undefined}
                >
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              );
            })}
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map((row) => {
          const view = row.original;
          return (
            <tr
              key={row.id}
              aria-label={view.title}
              className={view.row.saved === null ? "new" : undefined}
              data-selected={view.row.key === openKey || undefined}
              data-tour={view.row.key === TOUR_ROW_KEY ? TOUR_ROW : undefined}
            >
              {row.getVisibleCells().map((cell) => {
                const id = cell.column.id;
                const field = VALUE_CELLS.has(id) ? (id as GridField) : null;
                const absent = field !== null && !hasCell(view.row.values, field);
                return (
                  <td
                    key={cell.id}
                    className={
                      [
                        `col-${id}`,
                        field && view.changed.includes(field) && "changed",
                        absent && "not-applicable",
                      ]
                        .filter(Boolean)
                        .join(" ") || undefined
                    }
                    data-invalid={field && view.errors[field] ? true : undefined}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    {field && !absent && <CellMessage view={view} field={field} />}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function PhotoCell({ view }: { view: RowView }) {
  const [over, setOver] = useState(false);
  const { photo } = view.row.values;
  const take = (files: FileList | readonly File[] | null) => {
    const file = Array.from(files ?? []).find((each) => each.type.startsWith("image/"));
    if (file) view.onEdit({ photo: { file, preview: URL.createObjectURL(file) } });
  };
  return (
    <fieldset
      aria-label={`Drop a photo for ${view.title}`}
      className={`photo-cell${over ? " over" : ""}`}
      data-tour={view.row.key === TOUR_ROW_KEY ? "photo" : undefined}
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        if (event.currentTarget.matches(":disabled")) return;
        take(event.dataTransfer.files);
      }}
    >
      <label>
        {view.thumb ? (
          <img className="thumb" src={view.thumb} alt={view.title} />
        ) : (
          <span className="detail">No photo</span>
        )}
        <input
          {...cellProps(view, "photo")}
          className="visually-hidden"
          type="file"
          accept="image/*"
          onChange={(event) => {
            take(event.target.files);
            event.target.value = "";
          }}
        />
      </label>
      {photo !== null && (
        <button
          type="button"
          className="photo-remove"
          aria-label={`Remove the photo of ${view.title}`}
          onClick={() => view.onEdit({ photo: null })}
        >
          ×
        </button>
      )}
    </fieldset>
  );
}

function CellMessage({ view, field }: { view: RowView; field: GridField }) {
  const error = view.errors[field];
  if (error) return <span className="notice cell-message">{error}</span>;
  const warning = view.warnings[field];
  return warning ? <span className="warning cell-message">{warning}</span> : null;
}

function SortButton({
  column,
  field,
}: {
  column: Column<RowView, unknown>;
  field: SortColumn;
}) {
  const sorted = column.getIsSorted();
  return (
    <button
      type="button"
      className="sort-button"
      onClick={column.getToggleSortingHandler()}
    >
      {LABEL[field]}
      <span aria-hidden="true" className="sort-arrow">
        {sorted === "asc" ? "▲" : sorted === "desc" ? "▼" : ""}
      </span>
    </button>
  );
}

function HintTip({ field }: { field: keyof typeof HINT }) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  return (
    <span className="hint-tip">
      <button
        type="button"
        className="hint-icon"
        aria-label={`About ${LABEL[field]}`}
        aria-describedby={id}
        onFocus={() => {
          setFocused(true);
          setDismissed(false);
        }}
        onBlur={() => setFocused(false)}
        onMouseEnter={() => setDismissed(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !dismissed) {
            event.stopPropagation();
            setDismissed(true);
          }
        }}
      >
        ?
      </button>
      <span
        role="tooltip"
        id={id}
        className="tooltip"
        hidden={!focused || dismissed}
        data-dismissed={dismissed || undefined}
      >
        {HINT[field]}
      </span>
    </span>
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

function NameInput({
  value,
  onChange,
  ...textarea
}: {
  value: string;
  onChange: (value: string) => void;
} & Omit<ComponentProps<"textarea">, "value" | "onChange" | "rows">) {
  const ref = useRef<HTMLTextAreaElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: it is the value that changes the height
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      {...textarea}
      ref={ref}
      rows={1}
      className="name-input"
      value={value}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.preventDefault();
      }}
      onChange={(event) => onChange(event.target.value.replace(/\s*[\r\n]+\s*/g, " "))}
    />
  );
}

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

function SidePanel({
  row,
  photo,
  messages: { errors, warnings },
  disabled,
  takeFocus,
  onEdit,
  onClose,
}: {
  row: DraftRow;
  photo: string | null;
  messages: { errors: CellMessages; warnings: CellMessages };
  disabled: boolean;
  takeFocus: boolean;
  onEdit: (edits: Partial<RowValues>) => void;
  onClose: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: only as the panel opens
  useEffect(() => {
    if (takeFocus) heading.current?.focus();
  }, []);
  const { values } = row;
  const title = rowTitle(row);
  const changed = changedFields(row);

  const field = (name: GridField, control: (id: string) => ReactNode, hint?: string) => {
    const id = `side-panel-${name}`;
    const message = errors[name] ?? warnings[name];
    return (
      <div className={`panel-field${changed.includes(name) ? " changed" : ""}`}>
        <span className="panel-label">
          <label htmlFor={id}>{LABEL[name]}</label>
          {(name === "step" || name === "tolerance") && <HintTip field={name} />}
        </span>
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
      {photo && <img className="panel-photo" src={photo} alt={title} />}
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
              {field(name, (id) => (
                <GramsInput
                  id={id}
                  field={name}
                  value={values[name]}
                  onChange={(grams) => onEdit({ [name]: grams })}
                />
              ))}
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

function messages(
  row: DraftRow,
  result: RowResult | undefined,
): { errors: CellMessages; warnings: CellMessages } {
  const read = readRow(row);
  if (read.ok) return { errors: {}, warnings: read.warnings };
  return { errors: result?.status === "invalid" ? read.errors : {}, warnings: {} };
}

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

function tickedKeys(ticked: RowSelectionState): string[] {
  return Object.keys(ticked).filter((key) => ticked[key]);
}

function productIdOf(result: RowResult | undefined): string | null {
  return result && result.status !== "invalid" ? result.productId : null;
}

function rowTitle(row: DraftRow): string {
  return row.saved?.name || row.values.name.trim() || "New Product";
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function writesFor(client: CourierClient): GridWrites {
  return {
    saveProduct: (id, edits) => saveProduct(client, id, edits),
    uploadPhoto: async (file) => uploadProductPhoto(client, await resizePhoto(file)),
    removePhoto: (path) => removeProductPhoto(client, path),
    setProductAvailable: (id, available) => setProductAvailable(client, id, available),
    setCategoryProducts: (categoryId, productIds) =>
      setCategoryProducts(client, categoryId, productIds),
  };
}
