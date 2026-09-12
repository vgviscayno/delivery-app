# Saved delivery addresses, entry, and geocoding

Type: grilling
Status: resolved
Blocked by: —
Map: ../map.md

## Question

Ticket 29 settled that a customer **selects** a delivery address from saved addresses at checkout, and explicitly left address *entry* in fog. Nothing on the map creates those saved addresses, so checkout cannot function as specified. This ticket closes that.

Inputs already settled: Mapbox supplies geocoding (ticket 02, already the map provider — no new vendor). Ticket 23 settled what happens to an out-of-radius address — **blocked at entry**, with how far over shown — and put the store's fixed coordinates in `packages/config`, with a server-side backstop at submission.

Open:

- **The entry control.** Autocomplete-as-you-type against Mapbox geocoding, a map pin drop, or both? A Philippine address is often not resolvable to a rooftop by a geocoder — subdivisions, unnamed streets, "beside the sari-sari store." If the geocoder's best guess is the wrong building, what corrects it, and is the *pin* or the *text* the authoritative thing the driver navigates to?
- **The address record.** What fields exist beyond the geocoded result — label ("Home", "Mama's"), unit/floor, landmark notes, contact number for this address? Which are required? Does the delivery-radius check (23) run against the pin or the text?
- **Lifecycle.** Add, edit, delete, default. What happens to an address referenced by a past Order when the customer edits or deletes it — does the Order snapshot it, the way ticket 26/`docs/adr/0003` snapshots Product name and price? This is the same class of problem and should probably get the same answer.
- **The driver's side.** "Courier can't find the door" was named in the fog. Does the driver see the landmark note and the contact number, and is tap-to-call the same treatment ticket 14 gave the customer? Does anything the driver learns flow back to the address record, or is that out of scope?
- **The dispatcher's side.** Can a dispatcher enter or fix an address on the customer's behalf? Ticket 22's settings surface exists; this may or may not belong near it.

**Domain-modeling impact:** likely adds an **Address** (or Delivery address) term to `CONTEXT.md`, and possibly a snapshot ADR sibling to `0003`.

## Answer

### The pin is authoritative

Every Address carries a **required `lat`/`lng` pin**, and that pin is the only thing a driver navigates to. The written address is a human-readable caption captured alongside it, never a navigation target.

Rejected: text-authoritative (re-inherits the geocoder's guess on every job and makes ticket 23's radius check non-deterministic) and both-driver-picks (punts the problem onto the person with the least context and no way to fix it). A Philippine address is routinely not rooftop-resolvable — subdivisions, unnamed streets, "beside the sari-sari store" — so the geocoder's string and the true doorstep disagree often enough that the disagreement is the normal case, not an edge case. Pin-authoritative means a bad geocode is corrected **once**, by the person who knows the address, instead of re-guessed on every delivery. The landmark note then does what it's actually good at — the last 20 metres — instead of substituting for coordinates.

### The record

| Field | Required | Notes |
|---|---|---|
| `label` | ✅ | Ticket 29's checkout renders a *list*; without it the selector is unreadable |
| `lat` / `lng` | ✅ | The pin |
| `formatted_address` | ✅ (auto) | Geocoder or reverse-geocoder string, captured at pin-confirm time |
| `unit_floor_building` | ⬜ | |
| `landmark_note` | ⬜ | Highest-value field in this market |
| `contact_name` | ✅ | Not always the account holder |
| `contact_phone` | ✅ | **The only phone number in the system** — see below |
| `is_default` | ✅ | Exactly one per customer |
| `deleted_at` | — | Soft delete |

**`contact_phone` closes a gap nothing else on the map had noticed.** Ticket 09 chose email+password for customers, so no phone number existed on a profile anywhere. Ticket 14 gives the *customer* the driver's number; nothing gave the *driver* the customer's number, and "courier can't find the door" therefore had no escape hatch at all.

The number lives **on the Address, not the profile**, prefilled from the customer's last-entered one. "Mama's house" genuinely has a different person to call, and that is exactly the delivery where the driver most needs the right number. This does **not** reopen ticket 09: the phone is *delivery* data, never an identity or login factor.

### The Order snapshots it — extending ADR 0003

An Order **copies the whole address at submission** (pin, text, unit, landmark, contact name and phone) and keeps an `address_id` reference beside it, exactly as ticket 26 / `docs/adr/0003` does for Product name and price.

Recorded as an **extension to ADR 0003 rather than a new ADR** — same decision, second entity, and a second ADR restating 0003's reasoning would earn nothing. One argument *is* new and is written into the extension: the catalog case is about historical accuracy, but the address case is also **operational** — an in-flight Delivery must never have its destination moved out from under the driver. Snapshotting makes that impossible by construction, which is why the lifecycle below needs no guard rules.

**The copy lives on the Order, not the Delivery.** Ticket 27 already put the delivery fee on the Order; splitting "where it goes" from "what was charged for going there" would let two records disagree about one fact. The address is also part of the submission-time agreement in precisely ADR 0003's sense — *these items, at this price, to this door*, agreed in one act at one moment. The 1:1 Delivery reads it across the join at no cost.

### Entry flow: search → confirm pin → details

1. **Search** — Mapbox Geocoding type-ahead, biased to the store's region. Picking a result jumps the map.
2. **Confirm pin** — full-screen map, pin fixed at centre, customer pans the map beneath it. The reverse-geocoded street renders under the pin so an obviously-wrong spot is visible. Confirm is a deliberate tap.
3. **Details** — label, unit/floor, landmark note, contact name and phone.

**Step 1 is skippable.** A "Can't find it? Drop a pin instead" affordance goes straight to step 2, centred on the device's current location. In this market that is not an edge case, and a flow requiring a successful geocode would simply fail a meaningful share of customers. `formatted_address` is stored from the *reverse* geocode when a customer pin-drops, so the dispatcher console always has something human-readable.

Phone input takes a PH mobile format with **light validation only** — reject obvious junk, never block a number that might be real.

### Radius check: fires at pin-confirm, verdict never stored

Ticket 23's road-distance check (Mapbox Directions) runs **after step 2, before the details form** — one Directions call, and it avoids making a customer fill in a landmark note for an address about to be rejected. Rejection shows the distance over, per ticket 23.

**No `radius_ok` flag is persisted.** The radius is admin-configurable, so a stored verdict would need invalidating across every saved address in the system whenever an admin touches the setting — caching a value that ticket 29's submit-time gate recomputes anyway. Ticket 29's own principle applies verbatim: *the client half of every gate is a courtesy, the server half is the rule*. So it is recomputed three times, statelessly: at entry (blocks the save), at checkout selection (courtesy warning on ticket 29's selector), and at submit (the rule).

### Lifecycle

- **Edit** — allowed at any time, **including while a Delivery to that address is in flight**; the snapshot means the Delivery never moves. Editing the **pin** re-runs the radius check; editing label/unit/landmark/contact does not.
- **Delete** — **soft delete** (`deleted_at`), matching ADR 0003's treatment of Product, because the Order's `address_id` must never dangle. Allowed with an in-flight Delivery, same reason.
- **Default** — exactly one; the first address created becomes it. Deleting the default **promotes the most recently created survivor**; if none survive, checkout routes into the entry flow, which ticket 29 already specifies.
- **No cap** on saved addresses for MVP.
- **Management surface** — one screen, reachable from **both** account settings and checkout. From checkout it is a modal stack returning to the cart with the new address selected, per ticket 29.

Allowing edit/delete during an in-flight Delivery is the one **judgment call** rather than a forced move: it is mechanically safe, but a customer editing "Home" mid-run may expect the driver to get the update and won't. The alternative — a lock while a Delivery is live — is more machinery and arguably more confusing ("why can't I fix my own address?"). Taken deliberately; if it bites, the dispatcher path below is the fix, not a lock.

### Dispatcher's side

A dispatcher **cannot create or edit a customer's saved Address**. They may edit **this Order's snapshot only, and only the non-gating fields** — contact name/phone, landmark note, unit/floor. **Never the pin, never the saved record.**

This is the same shape ticket 28 used for removed line items: a boundary that otherwise holds, with one narrow hole cut in it deliberately. Non-gating fields cannot reopen ticket 23's radius gate on an already-accepted Order, which ticket 28's post-submission-editing scope line rules out. A genuinely wrong pin is a cancel and a fresh Order.

### Driver's side

The driver sees the full snapshot — label, formatted address, unit/floor, landmark note, contact name — with **tap-to-call on the contact phone**, matching ticket 14's `tel:` treatment and inheriting the same accepted no-masked-calling trade-off, now in both directions. A **Navigate** action hands the **pin** to the device's map app.

**Nothing flows back to the Address record.** A driver-learned correction reaches the system only through the dispatcher path above, scoped to that one Delivery. A driver-edits-the-customer's-address loop would need moderation, conflict rules, and a trust model this MVP has no reason to own. This is an input to **ticket 32** (driver app screens), which is where the job-detail layout is actually drawn.

### Domain-modeling impact

- `CONTEXT.md` gains **Address** and **Delivery address**.
- `docs/adr/0003-catalog-snapshot-on-order.md` gains an **Extension: delivery addresses** section; its heading broadened to "catalog and address data", filename kept stable.
- No new ADR.

### Surfaced

Two new tickets — see [40](40-price-approval-phone-number.md) and [41](41-mapbox-geocoding-storage-terms.md).

## Amendment — ticket 41 (Mapbox storage terms)

[Ticket 41](41-mapbox-geocoding-storage-terms.md) checked whether this ticket's record shape is licensable. It was not, as written, and now is with three changes:

- **Every geocode call sets `permanent=true`** — forward *and* reverse. Mapbox Product Terms §2.7.2 forbid storing or caching a Temporary Geocode for **any** period, so storing `formatted_address` on the Address and copying it onto the Order snapshot was non-compliant by default. With `permanent=true`, this ticket's record shape stands **exactly as decided** — snapshot included.
- **Search Box is out.** It has no permanent mode at any price, so the search step of *search → confirm pin → details* must call **Geocoding v6 forward**, not Search Box or any Search JS component backed by it. The flow is unchanged; only the endpoint is.
- **Cost:** permanent geocoding is $5/1,000 with no free allowance, ~$5–15/month here, and needs only a card on the Mapbox account.

Note on the drop-a-pin escape hatch: a **genuinely dropped** pin is customer data and outside Mapbox's terms entirely, but a pin the customer **confirms without moving** is still a copy of a Temporary Geocode's coordinates. The escape hatch does not cover the happy path — which is why `permanent=true` is set on every call rather than only when search is used.

Separately, §2.7.1(b) and §2.7.3(iv) forbid **displaying raw lat/lng to end users**. This ticket already treats the pin as a map object rather than a printed number, so no change here — but it constrains dispatcher and admin surfaces.
