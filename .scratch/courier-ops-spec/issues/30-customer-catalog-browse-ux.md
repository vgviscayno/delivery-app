# Customer catalog browse & cart UX

Type: prototype
Status: resolved
Blocked by: 26, 27, 29 (all resolved)
Map: ../map.md

## Question

"How should the customer catalog look and feel" is a **how-it-looks** question — best answered by a cheap, rough, concrete artifact to react to, not abstract grilling. Build a prototype with `/prototype` and link it as an asset on this ticket.

Charting framing (confirmed during graduation): a **categorized list with optional product photos, no search** for MVP (a single retailer's catalog is small enough to scroll). The prototype should let the user react to:

- **Browse layout.** Category grouping (from ticket 26's category model), list vs. card rows, where the photo, name, price, and availability sit. How an unavailable Product reads (greyed, hidden, "sold out" badge).
- **Price display.** A per-unit Product shows a flat price; a **per-weight** Product must read clearly as "£20/kg" (a rate, not a total) so the customer isn't surprised at checkout — this is the display half of ticket 27's provisional-pricing story. Prototype both side by side.
- **The by-weight quantity input — the crux.** How does a customer say "about 1kg of ribeye"? A stepper in weight increments, a few preset chip sizes (250g/500g/1kg), a free numeric entry? This input feeds the provisional total (ticket 27) and is the least obvious part of a meat catalog. Try 2–3 variants.
- **Add-to-cart affordance** and the running provisional total's visibility while browsing.
- **The cart screen itself** (scope added on resolution of ticket 29). Ticket 29 settled its *behaviour* — one screen carrying editable lines, address selector, delivery-fee breakdown, and Submit; whole-order gate failures as a banner, per-line failures inline on the offending line; a blocked unavailable line that the customer must remove themselves; a price-change banner whose acknowledgement is the second tap of Submit. What is *not* settled is how that stack of states reads on one screen. Prototype it here rather than as a separate ticket: **the by-weight input must be the same control on the product page and the cart line**, and prototyping them apart risks ending up with two.

Keep it throwaway — a stub with seeded Products, no backend. The **decision** this ticket resolves is which browse + price-display + weight-input treatment to carry into the spec; the prototype is the vehicle, the chosen variant is the answer.

**Domain-modeling impact:** none expected — consumes ticket 26's Product terms, doesn't add new ones.

Deliver: the chosen catalog browse layout, price-display treatment for both price types, the by-weight quantity-input pattern, and the cart-screen treatment of ticket 29's error and banner states — with the prototype linked as an asset.

## Prototype

[`prototypes/30-customer-catalog-and-cart.html`](../prototypes/30-customer-catalog-and-cart.html) — single throwaway file, open it directly in a browser.

Three structurally different treatments of browse → add → cart, cycled with ← / →. The by-weight input is the axis of variation, one idiom per variant:

| | Browse | By-weight input | Running total | Cart |
|---|---|---|---|---|
| **A** | One scrolling list, sticky category heads, thumbnail rows, add control in the row | **Inline stepper** — row expands to `− ~750 g +` in `weight_step_grams` increments | Sticky bottom bar | Same rows, same stepper, banners above |
| **B** | Category tab strip, 2-col photo cards, product opens a bottom sheet | **Preset chips** (250 g / 500 g / 1 kg / 1.5 kg / 2 kg) + "Custom…" revealing a stepper | Floating cart FAB | Card lines, same chips on the line |
| **C** | No photos at all — collapsible counter price-list | **Snap slider** to `weight_step_grams`, live `~1.25 kg · ~₱1,437` readout | Pinned in the header | Dense receipt ledger, same slider |

Seeded honestly against the settled decisions: money in **centavos** (ticket 27), `~` on every per-weight line, `weight_step_grams` as both granularity and minimum (ticket 26), ribeye + brisket sitting in two Categories at **different positions** to exercise the many-to-many ordering, and one catalog Product (Hungarian sausage) permanently sold out to show the unavailable browse treatment.

The **Cart state** control row drives ticket 29's gate stack: clean, unavailable line, price increase, outside store hours, out of radius, and **all four at once** — the case that matters, since 29 settled that gates never fail-fast. Rendering follows blast radius (whole-order banners, then per-line inline), an unavailable line is never auto-removed, and a price rise makes the acknowledgement the second tap of Submit.

## Answer

**Variant B — category tabs, photo card grid, product sheet with preset weight chips.** Picked by the user against A (scrolling list + inline stepper) and C (photoless counter price-list + snap slider).

### Browse layout

A horizontal **category tab strip** over a **2-column photo card grid**, one Category at a time. This rejects A's single continuous scroll through every Category and C's collapsible text sections.

Two consequences worth carrying into the spec:

- **A Product in several Categories is seen once per tab, never twice in one scroll.** Ticket 26's many-to-many means ribeye can sit in both *Premium cuts* and *Beef*; in variant A that produced the same product twice within one screen-and-a-half of scrolling. Tabs make the duplication invisible, which is the desirable behaviour — the per-Category position from the membership join is what orders each tab.
- **The tab strip scrolls horizontally.** With the 5 seeded Categories the last one already clips. Legible at 5, unexercised beyond that — flagged below.

### Photo presentation

`photo_url` **stays optional/nullable — ticket 26 is not amended.** A Product without a photo renders the **store logo mark** in the image band, at the same dimensions as a real photo, so card height never varies with data completeness.

This was the live risk in choosing B: a photo-led grid tempts you into making photos mandatory, which would have put a new upload obligation on the dispatcher's catalog CRUD and changed a settled field. The placeholder buys the grid's visual rhythm without that. Three of the twelve seeded Products are deliberately photoless so the realistic mixed case — a shop mid-rollout that hasn't photographed everything — is what was judged.

### Price display

Confirmed as prototyped, unchanged across all three variants:

- **per-unit** → flat amount, `₱285`, with the pack size as secondary text (`500 g pack`).
- **per-weight** → the rate, `₱1,150/kg`, in the accent colour, never a total. Secondary text carries `cut to order · 250 g steps`.
- Every per-weight figure anywhere in the app is prefixed `~`. This is ticket 27's provisional-price story made visible, and it holds on the card, in the sheet, on the cart line, and in the totals block.

### The by-weight quantity input — the crux

**Preset chips, derived per Product from `weight_step_grams`, plus a `Custom…` chip that reveals a stepper.**

- Chips are generated, not hardcoded: `step`, `2 × step`, then the round kilogram values up to 2 kg, filtered to multiples of the step and de-duplicated. So a 250 g-step Product (ribeye) offers `250 g / 500 g / 1 kg / 1.5 kg / 2 kg`, and a 500 g-step Product (pork belly) offers `500 g / 1 kg / 1.5 kg / 2 kg`. Ticket 26's rule that the step is also the minimum falls out of this for free — the smallest chip *is* the minimum.
- **`Custom…` reveals a stepper in the same `weight_step_grams` increments.** Variant B therefore contains variant A's control as its escape hatch rather than replacing it, which is worth stating plainly: A was not discarded so much as demoted to the uncommon path.
- **The same chip row is the control on the cart line.** This was the ticket's explicit reason for prototyping browse and cart together, and it holds — the cart line renders the identical generated chip set with the current selection active.

### Cart screen and ticket 29's gate stack

Behaviour is ticket 29's, unchanged. What this ticket settles is **density**, which 29 left open:

**Whole-order banners collapse to one line each, tapping expands the detail.** All failures stay simultaneously visible — ticket 29's never-fail-fast intent is preserved exactly — but the *All four at once* state now consumes ~129px instead of ~200px of a 375px screen, so two line items are reachable without scrolling instead of none. Ordering is untouched: blast radius, widest first.

The rest, as settled by 29 and confirmed in the prototype:

- Whole-order failures (store hours, delivery radius) render as banners above the list; per-line failures (availability, price) render **inline on the offending line**, uncollapsed, since they sit next to the control that fixes them.
- An unavailable line is **never auto-removed** — it dims, gains a *Sold out* badge and an explicit Remove button, and Submit stays disabled until the customer removes it.
- A price rise blocks, and the **acknowledgement is the second tap of Submit** — the button relabels to `Prices changed · tap again to accept ₱X` in the warning colour. A drop applies silently.
- Any edit to a line resets that acknowledgement.

### Running provisional total while browsing

**A floating cart button** carrying the live goods provisional total (`Cart · ~₱2,350`), rejecting A's sticky bottom bar and C's header-pinned figure. The delivery fee stays out of it and is broken out only at checkout, per ticket 29.

### Domain-modeling impact

**None, as expected.** Consumes ticket 26's `Product`, `Category`, `price_type`, `weight_step_grams` and ticket 27's provisional-price vocabulary; introduces no new term and no ADR. The store-logo placeholder is a presentation fallback, not a domain concept.

### Not exercised by this prototype

- **Category tab overflow.** The strip clips at 5 seeded Categories. Clustering behaviour for a shop with 12+ Categories — scroll affordance, overflow menu, or a different navigation entirely — was never tested.
- **Catalog photography as an asset pipeline.** Choosing a photo-led grid makes image dimensions, aspect ratio, compression and the dispatcher's upload/resize step matter in a way ticket 26's "likely a public Supabase bucket" doesn't cover. Carried to the map's fog.
- **Address entry.** The prototype selects from saved addresses only, exactly as ticket 29 bounded it. Entry, autocomplete and pin correction remain in the map's existing fog bullet.
