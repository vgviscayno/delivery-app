# Cart & checkout assembly flow

Type: grilling
Status: resolved
Blocked by: 27, 28
Map: ../map.md

## Question

This ticket settles the customer-app path from a populated cart to a submitted Order. The checkout screen is really an **assembly point** that stacks decisions already made elsewhere — it should reuse the existing gates, not reinvent them.

Charting framing (confirmed during graduation): the cart is **local device-side only** (no server cart table — a cart is pre-submission state per `CONTEXT.md`), and there is **no minimum order value** in MVP. Resolve with `/grilling`:

- **Cart mechanics.** Add/remove/change quantity; for a by-weight Product, choosing the estimated quantity (the "~1kg" input from ticket 26). What does the cart show as a running total — the provisional total per ticket 27? Does the cart survive app restart at all (local persistence) or is it purely in-memory for the session?
- **The checkout assembly + gate stack.** At checkout/submission, all of these re-validate **server-side, fail-closed** (the pattern from tickets 09/22/23): the **store-hours window** (ticket 22), the **delivery-radius** check on the chosen address (ticket 23), and the **weight-tolerance pre-authorization** (ticket 28). Specify the order they're checked, what the customer sees when each fails, and confirm no new gate is invented here beyond wiring these together.
- **Delivery address at checkout.** Which address does the Order ship to, and how is it chosen at checkout? (Address entry/geocoding is its own fog bullet — this ticket only needs the *selection* step at checkout, not the full autocomplete/saved-address design. Draw that boundary and note the dependency.)
- **The submission moment.** Submission is what turns the cart into an **Order** (and its 1:1 **Delivery**, per `CONTEXT.md`). Confirm this is a single server-authoritative action, and that a stale client can't submit past any gate. What does the customer see immediately after submit (confirmation, hand-off to ticket 14's tracking screen)?
- **Empty / error states.** Empty cart, an item that went unavailable while in the cart (ticket 26's live-edit question), an address that became out-of-radius.

**Domain-modeling impact:** reinforces "cart = pre-submission" and the submission-creates-Order-and-Delivery rule already in `CONTEXT.md`; probably no new terms. Confirm on resolution.

Deliver: the cart behaviour, the checkout gate-stack ordering and failure UX, the address-selection boundary, and the exact submission action — reusing the existing fail-closed pattern.

## Answer

The checkout screen is an **assembly point**, exactly as framed — but it assembles **two** inherited gates, not three, plus two conditions that belong to it. Ticket 28 rejected weight-tolerance pre-authorization at checkout after this ticket's body was written, so tolerance is handled entirely post-submission by the dispatcher phone call (`docs/adr/0005`). Nothing new was invented here.

### One screen, not two

**Cart** holds the chosen line items — pure client state, no commitment. **Checkout** is the non-item half: address, delivery fee, and the commit button. They live on **one screen**: lines stay editable all the way to submit, with the address selector, fee breakdown, and Submit below them.

The deciding factor is the failure UX. The gate stack returns per-line rejections ("ribeye is unavailable"), and the customer has to be somewhere they can edit lines to act on one. A read-only checkout screen forces a bounce back to the cart for every fixable problem. One screen is also one state model instead of two plus a handoff. The commitment boundary doesn't need a screen transition to be legible — the Submit button *is* the boundary.

### Cart mechanics

- **Persisted locally** (MMKV/AsyncStorage), scoped to the logged-in user id, cleared on logout. Not synced across devices — that would mean a server cart table, which contradicts `CONTEXT.md`'s "cart is pre-submission state."
- **Running total is the goods provisional total** (ticket 27). The **delivery fee is broken out as its own line at checkout**, above the grand total — not folded into the cart's running number.
- **Per-weight lines are marked as estimates everywhere they appear**, cart included, using ticket 26's `~` convention. The "your price may change" expectation is set before checkout, never sprung at it.
- **One-shot refresh on cart open** — re-fetch each line's Product for price and availability, update prices in place, flag anything unavailable. This is *not* ticket 26's rejected live subscription: it's a single query on screen open, no realtime plumbing, and it converts most submit rejections into something the customer sees before committing.
- **Outside store hours** the cart is fully usable and editable; only Submit is disabled, labelled with the next opening time ("Opens tomorrow 8:00 AM").

### The gate stack

Four conditions run **server-side at submit, fail-closed** (the pattern from tickets 09/22/23). All four are evaluated — **no fail-fast** — and every failure comes back in one response:

| Gate | Source | Server check at submit |
|---|---|---|
| **Store hours** | ticket 22 | Re-validated against server clock, never the client's. Hard, no grace period mid-checkout |
| **Delivery radius** | ticket 23 | Road distance (Mapbox Directions) from the store's fixed coordinates to the selected address |
| **Line availability** | ticket 26 | Every line's Product re-checked against the manual availability toggle |
| **Price increase** | this ticket | Snapshot price vs. the price the customer was shown; an increase blocks, a decrease applies silently |

**Rendering precedence is by blast radius**, not severity: store hours voids the whole attempt whatever the cart holds; radius voids it for this address; availability and price are per-line and fixable in place. Whole-order failures render as a banner above the list; per-line failures render inline on the offending line.

Fail-fast was rejected because it drip-feeds rejections — fix the address, resubmit, now the shop is closed. A stale cart can carry four independent problems at once, and the customer should see all four.

The client half of every gate is a courtesy; the server half is the rule. The cart can sit on a phone for a day, and ticket 26 deliberately chose no live catalog subscription for in-flight carts.

### Stale-cart resolution

- **An unavailable line is never auto-removed.** It's marked blocked and Submit stays disabled until the customer removes it themselves — the same principle ticket 28 landed on for removed line items: the system never silently drops meat someone asked for. Auto-removal also risks a customer submitting without noticing the thing they actually wanted is gone.
- **A price increase blocks and requires acknowledgement, but there is no modal.** The rejection response carries the new prices, the cart updates in place, and a banner names the changed lines and the new total. **The acknowledgement is the second tap of Submit.** A decrease applies silently.

### Delivery address

The Order ships to an address **selected from the customer's saved addresses**, with the default pre-selected. Checkout requires a selected address that already passed ticket 23's radius pre-check at entry time; the radius gate at submit catches the case where it stopped qualifying since.

**Boundary:** this ticket specifies the *selection* step only. Address entry, autocomplete, saved-address management, geocoding, and pin correction stay in the map's "Address entry and geocoding" fog bullet. A customer with no saved address is routed into that entry flow and returned to the cart.

### The submission moment

**One Edge Function, one transaction.** Gates re-checked server-side, Product name and price snapshotted (ticket 26), **Order and its 1:1 Delivery created together or not at all**. A stale client cannot submit past a gate because the client's own checks are never consulted.

**Double-submit** is handled by a **client-minted idempotency key, one per cart, rotated only on a successful submit.** A rejected submit mutates nothing — no Order, no Delivery, no record — so retrying under the same key is safe and correct; rotating per attempt would defeat the purpose, since a lost response is indistinguishable from a retry.

On success the cart clears and the app hands **straight to ticket 14's tracking screen** — in its map-less unassigned state, since no driver exists yet. **No interstitial confirmation or receipt screen**: ticket 14's unassigned state already reads as confirmation.

### Domain-modeling impact

**No new terms and no new ADR.** `CONTEXT.md` already pins **Cart** as pre-submission state (under Order), **Delivery fee**, and the submission-creates-Order-and-Delivery rule. Nothing decided here introduces a new noun.

The price-increase rule is the pre-submission counterpart of `docs/adr/0005`'s principle — the customer never pays more than they agreed to without a human asking them first — applied at the other end of the Order's life. Recorded as a cross-reference line on ADR 0005 rather than a competing ADR.

### Settled elsewhere, noted here

- **Delivery fee value** is a **dispatcher-editable setting on ticket 22's settings surface**, beside store hours and the radius — a business number that changes without a release. (The store's fixed coordinates in `packages/config` are the opposite kind of value.) Ticket 27's "flat for MVP, captured at submission" is unchanged.
- **No minimum order value** (charting) and no maximum either — cart size limits folded into the map's multi-stop fog bullet, since a per-order cap and a per-van cap are the same question.

### Follow-on

- **Ticket 30 widened** to cover browse → cart, rather than spawning a separate cart-screen prototype: the by-weight input has to be the same control on the product page and the cart line, and prototyping them apart risks two.
- **Customer order history** surfaced as a genuine gap — no surface anywhere on this map for past or completed Orders. Added to the map's fog.
