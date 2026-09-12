# Customer-app launch mode decision

Type: grilling
Status: resolved
Assignee: agent-session
Blocked by: —
Map: ../map.md

## Question

Ticket 20 left the customer-app launch mode with the client: **Option A — controlled pilot** (small invited group via Play closed-testing track, payment stays out of scope) vs. **Option B — public Play launch** (anyone can download/order, which pulls payment into a real MVP decision plus additive launch work — privacy policy, Data Safety form, store listing, business-identity verification).

Settle which the client picked, and whether their answer was a clean pick or a caveated one that changes the shape of the decision.

## Answer

**Client picked Option A — controlled pilot via Play closed-testing track**, cleanly, with no caveat surfacing a hybrid ("A, but a few real customers") or a payment-first sequencing condition.

Consequences, per the decision tree ticket 20 set up for exactly this case:

- **Payment stays out of scope.** No in-app payment, no cash-on-delivery/pay-at-counter ticket. The Out of scope line stands unchanged.
- **No new tickets from this answer alone.** The forward-compatibility guardrails ticket 20 already recorded — Play closed-testing track (promotable to production, same signing key), a settlement-ready Order model — cover this case; there is nothing further to design now that pilot is confirmed rather than public.
- **Public-launch additive work (privacy policy, Data Safety form, store listing, business-identity verification) is not needed for MVP.** It stays latent as exactly that: work a future public-promotion effort picks up, not something this map tickets now.

This closes the one item ticket 20 left open. See ticket 20's `## Update` note.
