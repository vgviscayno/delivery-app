/**
 * The Catalog walkthrough, as data: one tour per sub-tab, each step pointing at a
 * `data-tour` attribute on the page rather than at a class name or text, so restyling or
 * rewording the page never loses a step.
 */

export type TourName = "products" | "categories";

/** What a step needs the page to show, beyond what is there when the tour starts. */
export type TourScene = "details";

export interface TourStep {
  /** The `data-tour` value of the element the step highlights. */
  readonly target: string;
  readonly title: string;
  readonly description: string;
  readonly scene?: TourScene;
  /** Passed over when there is nothing to point at, such as a Category list with none. */
  readonly optional?: boolean;
}

/** The selector for a step's element. */
export const tourTarget = (target: string) => `[data-tour="${target}"]`;

/** The `data-tour` value of the draft row the Products tour demonstrates on. */
export const TOUR_ROW = "tour-row";

export const TOURS: Record<TourName, readonly TourStep[]> = {
  products: [
    {
      target: "add-row",
      title: "Add row",
      description:
        "Add row puts a new Product at the bottom of the grid. This tour has added one to show you around. It is never saved, and goes when the tour ends.",
    },
    {
      target: TOUR_ROW,
      title: "One row, one Product",
      description:
        "Type into a cell, then press Tab to move to the next one, or Shift+Tab to go back. Nothing is written until you press Save.",
    },
    {
      target: "column-price",
      title: "Price",
      description:
        "A per-unit Product's price for one, or a per-weight Product's rate per kg. The cell says which: “each” or “/ kg”.",
    },
    {
      target: "column-step",
      title: "Ordered in",
      description:
        "For a per-weight Product, the steps customers order in. The ? beside each heading explains its column.",
    },
    {
      target: "column-tolerance",
      title: "Weight tolerance",
      description:
        "How far a per-weight Product's packed weight may differ from what the customer ordered before they must approve the new price.",
    },
    {
      target: TOUR_ROW,
      title: "Fill down",
      description:
        "Ctrl+D copies a cell into every ticked row below it, or, with none ticked, copies the cell above into this one.",
    },
    {
      target: TOUR_ROW,
      title: "Changes are highlighted",
      description:
        "Cells you have changed stay highlighted until you press Save, so you can see what Save will write.",
    },
    {
      target: "save",
      title: "Save",
      description:
        "Save writes each changed row on its own, and each row then says how it went: saved, or which cells to fix. One bad row never holds back the rest.",
    },
    {
      target: "column-tick",
      title: "Tick rows",
      description:
        "Tick rows to change several Products at once. The box in the heading ticks every row shown.",
    },
    {
      target: "bulk-actions",
      title: "Change ticked rows",
      description:
        "With rows ticked, mark them available or unavailable, add them to or remove them from a Category, or delete them.",
    },
    {
      target: "side-panel",
      scene: "details",
      title: "Details",
      description:
        "Details opens a row here, beside the grid, with room for the Product's description. Esc closes it.",
    },
  ],
  categories: [
    {
      target: "category-list",
      title: "Categories",
      description:
        "How customers browse the catalog, in this order from the top. Pick a Category to open it beside the list.",
    },
    {
      target: "category-row",
      optional: true,
      title: "Drag to reorder",
      description:
        "Drag a Category by its handle ⠿ to move it. With the keyboard, focus the handle, press Space, move it with the arrow keys and press Space again to drop it.",
    },
    {
      target: "category-move",
      optional: true,
      title: "Or move it one place",
      description: "↑ and ↓ move the open Category one place up or down.",
    },
    {
      target: "category-products",
      optional: true,
      title: "Products in a Category",
      description:
        "The open Category's Products, in the order customers see them. Drag them by their handles, or use ↑ and ↓, to reorder them. This changes the order in this Category only.",
    },
  ],
};

/** Where the browser remembers a tour was seen: per browser, not per account. */
const seenKey = (name: TourName) => `courier-ops.tour-seen.${name}`;

/**
 * Whether this browser has finished or closed the tour. Storage that is blocked or
 * throws counts as not seen, so the tour may just show again.
 */
export function hasSeenTour(name: TourName, storage = browserStorage): boolean {
  try {
    return storage()?.getItem(seenKey(name)) === "1";
  } catch {
    return false;
  }
}

export function markTourSeen(name: TourName, storage = browserStorage): void {
  try {
    storage()?.setItem(seenKey(name), "1");
  } catch {
    // Not remembered; the tour shows again next time.
  }
}

/** Reading `localStorage` itself can throw where site data is blocked. */
function browserStorage(): Storage | undefined {
  return typeof localStorage === "undefined" ? undefined : localStorage;
}
