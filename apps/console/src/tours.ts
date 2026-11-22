export type TourName = "products" | "categories";

export type TourTopic = "add" | "edit" | "duplicate" | "bulk" | "details";

export interface TourStep {
  readonly target: string;
  readonly title: string;
  readonly description: string;
  readonly opensDetails?: boolean;
  readonly topics?: readonly TourTopic[];
  readonly optional?: boolean;
}

export const tourTarget = (target: string) => `[data-tour="${target}"]`;

export const TOUR_ROW = "tour-row";

export const SHOW_ME_AROUND = "show-me-around";

export const TOPICS: Record<TourName, readonly { topic: TourTopic; label: string }[]> = {
  products: [
    { topic: "add", label: "Add a Product" },
    { topic: "edit", label: "Edit Products" },
    { topic: "duplicate", label: "Duplicate a row" },
    { topic: "bulk", label: "Change several at once" },
    { topic: "details", label: "Details" },
  ],
  categories: [],
};

export function stepsOf(name: TourName, topic: TourTopic | null): readonly TourStep[] {
  const steps = TOURS[name];
  return topic === null ? steps : steps.filter((step) => step.topics?.includes(topic));
}

const TOURS: Record<TourName, readonly TourStep[]> = {
  products: [
    {
      target: "add-row",
      topics: ["add"],
      title: "Add row",
      description:
        "Add row puts a new Product at the bottom of the grid. This tour has added one to show you around. It is never saved, and goes when the tour ends.",
    },
    {
      target: TOUR_ROW,
      topics: ["add"],
      title: "One row, one Product",
      description:
        "Type into a cell, then press Tab to move to the next one, or Shift+Tab to go back. Nothing is written until you press Save.",
    },
    {
      target: "column-price",
      topics: ["add"],
      title: "Price",
      description:
        "A per-unit Product's price for one, or a per-weight Product's rate per kg. The cell says which: “each” or “/ kg”.",
    },
    {
      target: "column-step",
      topics: ["add"],
      title: "Ordered in",
      description:
        "For a per-weight Product, the steps customers order in. The ? beside Ordered in and Weight tolerance explains each one.",
    },
    {
      target: "column-tolerance",
      topics: ["add"],
      title: "Weight tolerance",
      description:
        "How far a per-weight Product's packed weight may differ from what the customer ordered before they must approve the new price.",
    },
    {
      target: "photo",
      topics: ["add"],
      title: "Drop a photo here",
      description:
        "Drop a photo on a row, or click to pick one. It shows here straight away, and is resized and uploaded only when you press Save.",
    },
    {
      target: TOUR_ROW,
      topics: ["edit"],
      title: "Fill down",
      description:
        "Ctrl+D copies a cell into every ticked row below it, or, with none ticked, copies the cell above into this one.",
    },
    {
      target: TOUR_ROW,
      topics: ["edit"],
      title: "Changes are highlighted",
      description:
        "Cells you have changed stay highlighted until you press Save, so you can see what Save will write.",
    },
    {
      target: "save",
      topics: ["add", "edit"],
      title: "Save",
      description:
        "Save writes each changed row on its own, and each row then says how it went: saved, or which cells to fix. One bad row never holds back the rest.",
    },
    {
      target: "duplicate",
      topics: ["duplicate"],
      title: "Duplicate",
      description:
        "Duplicate copies a row into a new one just below it: everything but the name and photo, which a new Product needs of its own.",
    },
    {
      target: "column-tick",
      topics: ["bulk"],
      title: "Tick rows",
      description:
        "Tick rows to change several Products at once. The box in the heading ticks every row shown.",
    },
    {
      target: "bulk-actions",
      topics: ["bulk"],
      title: "Change ticked rows",
      description:
        "With rows ticked, mark them available or unavailable, add them to or remove them from a Category, or delete them.",
    },
    {
      target: "side-panel",
      opensDetails: true,
      topics: ["details"],
      title: "Details",
      description:
        "Details opens a row here, beside the grid, with room for the Product's description. Esc closes it.",
    },
    {
      target: SHOW_ME_AROUND,
      title: "Pick a topic",
      description:
        "That's the tour. Show me around takes you through it again, or through one part of it: adding, editing, duplicating, changing several rows at once, or Details.",
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

const seenKey = (name: TourName) => `courier.console.tourSeen.${name}`;

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
  } catch {}
}

function browserStorage(): Storage | undefined {
  return typeof localStorage === "undefined" ? undefined : localStorage;
}
