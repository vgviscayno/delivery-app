---
status: accepted
---

# The console's Products grid is a draft saved row by row, and its tours only point

The console's Catalog mode edits Products like a spreadsheet: one row per Product. Every edit is a local draft kept in the page, and nothing is written until Save.

**Save writes each valid changed row on its own.** One bad row never holds back the rest. A row that's invalid or fails stays in the draft for the dispatcher to fix, and the others are still written. For each row, Save writes the Product first (`save_product`, with its photo uploaded only now that the row is known to be valid), then its availability, then its Category memberships. Memberships go last, once every new Product has an id to put in a Category. A new Product starts available, so only an unavailable new row needs the availability switch. A Category's new order is the old order, minus what was taken out, with newly added Products at the end in row order. If a new row's Product was created but a later write failed, the row keeps that Product's id so the retry doesn't create it twice. Deleting ticked rows works the same way: each is deleted on its own, so the ones the server deletes go even if some fail.

**Every read of the catalog is folded into the draft.** Cells edited and not yet saved keep the edit. Every other cell takes the server's value. Deleted Products drop out, and new ones are added at the end.

**Filters and sorting read what was saved, not what's being typed.** A row doesn't vanish or jump while it's being edited. Rows never saved have nothing to match, so they're always shown, at the bottom in the order they were added. Ties keep the catalog's order, and a column sorts up, down, then back to the catalog's order. Per-unit and per-kg prices aren't comparable amounts, so each sorts among its own kind. TanStack Table holds the columns, the ticks and which header is sorted, but the rows reach it already filtered and sorted by the grid's own rules.

**The URL holds the view, never the draft.** `/catalog/products` keeps the Product open in the side panel, the filters and the sort in its search params, so a refresh or a pasted link opens the same view. Search params that don't parse are dropped, not refused, so an old or hand-edited link still opens. A row that has never been saved has no id for the URL, and its id is written there only once the catalog has been read back, so the URL never names a Product the page hasn't heard of yet.

**Leaving with unsaved edits asks first.** In-app navigation asks in the page. A refresh or a closed tab gets the browser's own prompt. Both happen only while there's something unsaved, and moving within the Products view (filters, the side panel) never asks.

**The console's form checks repeat the server's.** They exist so the console can say what's wrong in words, naming every bad field at once. The server still has the last say. This holds for the Products grid, the Product form and the Settings form.

## The tours

Each Catalog sub-tab has a tour (driver.js) that runs by itself on the first visit in a browser, and again, whole or one topic at a time, from "Show me around".

- **Steps point at `data-tour` attributes**, not class names or text, so restyling or rewording the page never loses a step.
- **The tour only points.** Whatever it highlights is made inert while it does, so neither a click nor Tab can reach Save, Delete or a cell.
- **The Products tour demonstrates on a row of its own.** It's a per-weight Product, so every column has a value, and it's removed however the tour ends. The tour's row is never part of the draft: it doesn't count as unsaved, Save never writes it, and "Tick every row shown" never acts on it.
- **A tour counts as seen as soon as it starts**, so leaving part-way doesn't bring it back. Seen is remembered per browser in localStorage, not per account. Storage that is blocked counts as not seen, so the tour may just show again.
