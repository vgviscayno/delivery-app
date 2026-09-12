---
status: accepted
---

# A dispatcher can reverse a pickup, returning a Delivery to `Unassigned`

The courier status `Picked up` asserts a physical fact: **exactly one driver holds the goods in a vehicle.** When that driver cannot continue — the vehicle fails, they fall ill, the handset dies in a dead zone — the goods have to reach the customer some other way. The system cannot move meat; only a person can. A **Handback** is the record that a person did.

A Handback is a **dispatcher-only** transition from `Picked up` to **`Unassigned`**, carrying a **mandatory reason**. Its meaning is exactly "no driver holds these goods." The dispatcher then assigns in the ordinary way, possibly back to the same driver.

## Considered options

**Reassigning in place** — letting a dispatcher point a `Picked up` Delivery at a different driver while the status holds — was rejected. It makes the record assert that driver B carries goods driver B has never touched. Every surface downstream then lies in the same direction: the console shows B's pin as the location of the meat, the customer's tracking screen follows B, and the proof-of-delivery photo is captured by whoever eventually finds the product. The status exists to mean one thing, and this option quietly redefines it as "whoever is nominally responsible."

**Forbidding it outright** — `Picked up` exits only to `Delivered` or `Cancelled` — was rejected as too expensive for an ordinary event. A van breaking down would cost the customer their whole Order: cancel, re-cut every per-weight line, re-price, re-approve, re-place. The goods are usually fine; it is the driver who is not.

**Landing the Handback on `Assigned`, keeping the original driver**, was rejected in favour of always landing on `Unassigned`. Three real situations exist — goods returned to the shop with the driver out sick, goods returned with the driver switching vehicles, and a roadside handover between the two drivers — and at the instant of the transition, "nobody holds these goods" is literally true in all three. One edge with one meaning beats two edges that each cover part of the space. The roadside handover becomes handback → assign → pick up, which is three steps that describe what physically happened rather than one step that pretends the meat teleported.

**A dedicated `Abandoned` terminal status**, for a Delivery nobody ever completed, was rejected on the same reasoning that produced this edge. A status needs a transition rule, and "nobody knows what happened" has no rule — the system cannot detect it, and the moment a dispatcher declares it they know something, so it is no longer unknown. `Cancelled` plus a recorded cause covers it without inventing a state that only ever means "we stopped asking."

## Consequences

- **`Picked up` now carries a stated invariant.** `CONTEXT.md` says in words that the status means one driver physically holds the goods. This is what makes the Handback necessary rather than merely convenient, and what rules out reassignment in place.
- **Prep status is untouched.** The goods are still packed and still priced, so a handed-back Delivery stays at `Ready`. Nothing re-enters `Preparing`. Prep and courier tracks remain independent, as ADR 0005 was careful to keep them.
- **The Final price does not unfreeze.** ADR 0004 freezes it on reaching `Picked up`; it is frozen on the *first* `Picked up` and never releases. A Handback does not change what is in the box. Repacking after partial spoilage is therefore **not** a Handback — new packed weights mean a new Final price, which reopens Price approval, which ADR 0005 forbids after submission. Repacking is a cancellation plus a fresh Order. **An Order has exactly one Final price, set once.**
- **Handback is not the only exit, and the choice is a human's.** This is a meat business, and product that sat in an unpowered van may not be fit to deliver. `Cancelled` remains reachable from `Picked up`. The dispatcher inspects the goods and picks a door; the system records which one was used and why. No spoilage state is modelled — inventory is not modelled at all (ticket 26 uses a manual availability toggle with no stock count).
- **The reason is the whole record.** Map ticket 10 persists no location history, so nothing can be reconstructed after the fact. The mandatory reason on a Handback — and the same cause field extended to `Cancelled` from `Assigned` or `Picked up` — is the only trace the event leaves. It is a short fixed cause list plus free text, not free text alone, so the cases worth counting stay countable.
- **Existing concurrency machinery covers the races, with one extension.** Map ticket 37's conditional writes already guard transitions on current status. The `Delivered` transition additionally guards on the **holder**, because a driver who went dark, delivered anyway, and reconnected after a Handback would otherwise write `Delivered` onto a Delivery now assigned to someone else. Zero rows affected is the conflict signal, as ticket 37 established; the driver app names the conflict and **retains the proof-of-delivery photo in its upload queue** rather than discarding it.
- **The customer sees the reversion, framed as a delay.** Because a Handback is recorded, "this Delivery has been handed back" is derivable, so the customer's screen reads as a delay rather than resetting silently to "waiting for a driver." The reason is never shown — it may be about a person's health. The second `Picked up` fires the customer push again, which is what releases them from the delay notice.
- **The push pipeline needs no change.** A Handback is a `courier_status` UPDATE, and map ticket 12's Postgres trigger already sends a driver a push when a Delivery assigned to them is reassigned away. It fires by itself.
- **The dispatcher phones the customer; the system only reminds them.** Consistent with ADR 0005, where the shop chases because the shop changed the deal. The Handback dialog carries a reminder, not an enforcement.
