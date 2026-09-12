# Product catalog domain model & dispatcher management

Type: grilling
Status: resolved
Blocked by: —
Map: ../map.md

## Question

The customer app lets customers choose items (in-scope since ticket 01), but no catalog concept exists in the domain model or the map yet. This ticket introduces **Product** as a first-class domain concept and settles how the catalog is authored and managed.

Charting framing (confirmed with the user during graduation of the "Product catalog and cart" fog): the catalog is a **real, dispatcher-maintained list** living on the settings surface ticket 22 introduced (the same place `store_hours`/`store_closures` and ticket 23's radius config live). The customer app renders it read-only. Resolve the following with `/grilling` and `/domain-modeling`:

- **What a Product is.** Fields: name, description, category, availability toggle, photo (optional — see ticket 30). Is `category` a free-text field, a fixed enum, or its own managed list? Does a Product have a stable identifier that an Order line item references (so a later price/name edit doesn't rewrite historical Orders)?
- **Price type on the Product.** A Product is priced either **per-unit** (a packaged item, e.g. "500g pack of sausages — £6") or **per-weight** (cut-to-order, e.g. "ribeye — £20/kg"). This `price_type` is the field ticket 27 builds the Order pricing model on top of. Confirm the two types are sufficient for MVP and pin their exact fields (unit price; per-kg rate; for by-weight, the estimate-quantity granularity a customer picks).
- **Availability.** Is availability a simple on/off toggle, or is there stock/quantity tracking? (Substitutions are Out-of-scope per the map, which argues against real stock levels — a manual availability toggle is likely enough.)
- **Where it's managed.** Confirm the catalog CRUD belongs on ticket 22's dispatcher settings surface rather than a new surface. What operations does the dispatcher need (add, edit price, toggle availability, reorder, delete vs. soft-delete)?
- **Editing live.** What happens to Orders already placed (or carts in flight) when a dispatcher edits a Product's price or marks it unavailable? This is where the stable-identifier / price-snapshot question bites — ties into ticket 27.

**Domain-modeling impact:** this ticket adds **Product** (and possibly **Product category**) to `CONTEXT.md`. Update the glossary inline on resolution. The `_Avoid_` guidance for Order already treats "cart" as pre-submission; make sure Product's definition doesn't collide.

Deliver: the Product concept and its fields, the `price_type` values ticket 27 depends on, the availability model, and the confirmed management surface — with `CONTEXT.md` updated.

## Answer

Two new domain concepts — **Product** and **Category** — plus a **Product–Category membership** join that carries its own ordering. Catalog is dispatcher-maintained data (not code), managed on ticket 22's settings surface, rendered read-only in the customer app.

### Product

Stable-ID + snapshot model: the Product row is edited in place ("current truth"); Order line items copy name/price/`price_type` at submission ("what was agreed"), so catalog edits never rewrite placed Orders.

| Field | Notes |
|---|---|
| `id` | Stable, permanent. Order line items reference it (ticket 27) but snapshot its pricing fields at submission. |
| `name` | Required. |
| `description` | Optional free text. |
| `photo_url` | Optional/nullable. Presentation (placeholder vs. text-only row) → ticket 30. Storage likely a **public** Supabase bucket (catalog photos aren't sensitive like ticket 11's proof-of-delivery). |
| `price_type` | Discriminant: `per_unit` \| `per_weight`. **Exactly two types — confirmed sufficient for MVP.** The field ticket 27 builds the Order pricing model on. |
| `unit_price` | Present when `per_unit`. |
| `price_per_kg` | Present when `per_weight`. |
| `weight_step_grams` | Present when `per_weight`. Per-Product configurable step (ribeye 250g, mince 500g). **The step is also the minimum order** — no separate `min_weight_grams`. It is the granularity the customer picks their estimate in. |
| `is_available` | Manual on/off toggle. **No stock/quantity tracking** (consistent with substitutions being out-of-scope; a by-weight "stock count" is meaningless anyway). |
| `deleted_at` | **Soft-delete.** Snapshots already protect history, but ticket 27's line item keeps a `product_id` reference, so a hard-delete would dangle it. One nullable timestamp + a `WHERE deleted_at IS NULL` catalog filter. |

`price_type` is a **tagged/discriminated union** — one variant carries `unit_price`, the other `price_per_kg` + `weight_step_grams`. Ticket 27's schema should honour the discriminant, not flatten to nullable-both columns.

### Category

A grouping customers navigate the catalog by (its own noun, not a Product attribute — it's what customers browse *by*). Fields: `id`, `name`, `display_order` (orders the section headings down the browse screen; dispatcher-controlled). A managed list on the settings surface, **not** a code enum (an enum contradicts the "catalog is data" premise) and **not** free-text (typo-fragmentation would break browse grouping).

### Product–Category membership (many-to-many)

A Product can sit in several Categories (ribeye under "Beef" *and* "BBQ"). The **membership row carries `display_order`**, so a Product's rank is set independently per category (1st in "BBQ", 5th in "Beef"). A Product therefore renders once in each of its categories on the browse screen — intended, not duplication.

### Management surface & operations

Catalog CRUD is a **section on ticket 22's dispatcher settings surface** (alongside `store_hours`/`store_closures`/radius) — no new surface. Operations: **add**, **edit** (fields + category memberships), **toggle availability** (the daily one-click action), **reorder** within a category (writes membership `display_order`), **soft-delete**.

### Editing live (in-flight Orders/carts)

- **Placed Orders**: untouched. Snapshots make catalog edits invisible to them.
- **In-flight carts** (local device-side only, per ticket 29): **no live subscription**. Re-validated at checkout against current catalog (ticket 29's fail-closed gate stack): a now-unavailable item blocks submission ("X is no longer available, remove to continue"); a changed price is quoted fresh at submit — price becomes "agreed" only at submission. The cart is a hint; the checkout is the contract.

### Boundaries handed to other tickets

- **Ticket 27**: owns the Order line-item schema and the provisional→final total. This ticket only asserts `price_type` and that line items snapshot pricing.
- **Ticket 30**: owns photo presentation and the by-weight input *shape* (stepper/chips/etc.) — this ticket fixes only the domain fields (`weight_step_grams` as granularity + minimum).
- Out-of-scope (unchanged): stock tracking, substitutions, promotions.

### Domain-modeling impact

- `CONTEXT.md` gains **Product**, **Category**, and the membership relationship. Product's definition is disjoint from "cart" (cart stays pre-submission per the existing Order `_Avoid_` note) — no collision.
- **ADR** written: `docs/adr/0003-catalog-snapshot-on-order.md` — the stable-ID + snapshot decision (chosen over immutable catalog versioning) passes all three tests: hard to reverse (it's the Order/Product seam), surprising to a future reader ("why does the line item copy the price?"), and a real trade-off (versioning vs. snapshot).

Status: resolved.

## Comments

### Amended by ticket 27 (Order pricing model)

The Product schema above gains **one field**, confirmed by the user while resolving [ticket 27](27-order-pricing-provisional-final-record.md):

| Field | Notes |
|---|---|
| `tolerance_grams` | Present when `per_weight`. Dispatcher-set **per Product**, defaulting to **250 g**. The allowed difference between a customer's estimated weight and the packed weight, **symmetric** (a shortfall counts the same as an excess). Exceeding it obliges the shop to contact the customer before dispatch — the flow is ticket 28's. |

Rationale for per-Product rather than one global number: ribeye is cut to order and a butcher can land close; mince, bones and trim cannot be hit as tightly. A single figure would be too tight for one and too loose for the other.

It sits beside `weight_step_grams` — both are per-Product weight settings, both exist only on the `per_weight` variant, and both are edited on the same settings-surface form. Ticket 27's line item **captures** `tolerance_grams` at submission, exactly as it captures the rate, for the reason `docs/adr/0003` gives: it is part of what the customer agreed to.

Also settled in ticket 27, and relevant to this ticket's fields: money is stored as whole **centavos** (₱), so `unit_price` and `price_per_kg` are integers — `price_per_kg` is centavos *per kilogram*, never converted to a per-gram rate.
