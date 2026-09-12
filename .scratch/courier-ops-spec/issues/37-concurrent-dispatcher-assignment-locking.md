# Concurrent-dispatcher assignment locking, the real mechanism

Type: grilling
Status: resolved
Blocked by: —
Map: ../map.md

## Question

Ticket 15 settled the **UI** for two dispatchers reaching for the same driver — a named lock pill and a disabled Assign button — but scripted it as static seed data. No mechanism backs it. Supabase is settled (ticket 05), so this is now answerable.

Open:

- **The mechanism.** A Supabase Realtime **presence** channel carrying soft claims, a short-lived **DB lock** on the driver row, or optimistic concurrency at the assignment write (let both dispatchers press, let one lose, tell the loser clearly)? The three differ mainly in how they fail: presence is advisory and can go stale, a DB lock can strand a driver if a dispatcher closes their laptop mid-assign, optimistic concurrency needs no lock at all but shows the conflict only after the fact.
- **Does this need solving at all?** The honest first question is dispatcher headcount. If one person dispatches, ticket 15's lock pill is UI for a race that never happens, and the right answer may be optimistic concurrency plus a clear error — a fraction of the machinery. If the answer here is "not needed for MVP," ticket 15's lock pill should be amended, not left as unbacked UI.
- **Lock lifetime and release.** Whatever the mechanism, what releases it: an explicit cancel, a timeout, a disconnect? Ticket 09 gives the dispatcher an **idle timeout** — the interaction between that and a held claim needs stating.
- **Scope check.** Assignment is the only contended action ticket 15 identified. Confirm nothing else on the console needs the same treatment (ticket 31's packing bench, for instance, where two staff could plausibly weigh the same Order).

Ticket 15 raised this and left it explicitly unbacked, so whatever this decides **amends ticket 15**. If Supabase presence API facts are needed to choose, spawn a research ticket rather than guessing.

**Domain-modeling impact:** none expected. May warrant a short ADR if a locking mechanism is adopted.

## Answer

**No locking mechanism is adopted.** The ticket asked which of three mechanisms backs ticket 15's
lock pill; the answer is that the pill is deleted and a one-line conditional write replaces the
whole question.

**The contended resource is the Delivery, not the driver.** Ticket 15 put the lock on the driver
row. `docs/adr/0001-multi-stop-dispatch.md` permits one driver to hold many concurrent Deliveries,
so two dispatchers assigning two *different* Deliveries to the same driver produces a state the
system already allows — nothing is broken. The only write that can go wrong is two writers setting
the *same* Delivery's `courier_status: Unassigned → Assigned` with different drivers, where the
second silently overwrites the first and the wrong van collects the Order. Ticket 15 was aimed at
the wrong noun.

**Mechanism: optimistic concurrency at the assignment write.** The assignment is a conditional
update — set `driver_id` and `courier_status = 'Assigned'` **only where `courier_status` is still
`'Unassigned'`**. Zero rows affected *is* the conflict signal. This holds nothing, so it has no
lock-lifetime question at all: the ticket's "what releases it — cancel, timeout, disconnect?" and
its interaction with ticket 09's dispatcher idle timeout are both **moot**, not deferred. A row
lock or a TTL claim record would each have traded a millisecond-long race for a liveness problem
(a dispatcher closing a laptop mid-assign strands the Delivery).

**One dispatcher for the MVP** (user's call). This settles the "does this need solving at all?"
half of the ticket without going to the business owner — dispatcher headcount was never asked in
ticket 34's document and now never needs to be. Ticket 15's named lock pill and its disabled
Assign button are **deleted, not deferred**: with one dispatcher there is no second dispatcher to
name.

**The guard outlives its own justification.** Removing the dispatcher-vs-dispatcher race does not
remove the need for the condition, because `CONTEXT.md` lets a **customer** cancel a Delivery while
`courier_status` is `Unassigned`. So the live race is now *dispatcher assigns while customer
cancels*, and `WHERE courier_status = 'Unassigned'` catches it unchanged. The condition ships in
the MVP on its own merits.

**Failure message names the cause** (chosen over a single generic message). After a zero-row write
the console re-reads the Delivery, so it already holds the current `courier_status` and can say
which thing happened: *"The customer cancelled this Order"* versus *"This Delivery is already
assigned to Ramon."* The two demand different reactions from the dispatcher — job gone versus work
already done — and a generic "no longer unassigned" would make them go and look. Naming the cause
costs nothing beyond the re-read that already happened.

**Scope check — two other contended writes, one real:**

- **Ticket 31's packing bench: nothing needed.** Two staff can weigh the same Order (ticket 31
  records the shop as sometimes one person, sometimes two), but two packed weights on one line item
  is last-write-wins on a number, and the bench renders live so a person sees the change. Ticket
  28's "every per-weight line item has a packed weight" rule already guards `Ready`.
- **Price approval: same conditional write.** Record the outcome **only if the Price approval is
  still pending**. Even with one dispatcher, a customer cancelling an `Unassigned` Delivery can race
  the dispatcher recording an outcome — and writing `docs/adr/0005`'s approved-total snapshot
  against a cancelled Order is a bad *record*, not merely a lost race. Amends ticket 28.

**MVP assumption and its guardrail.** "One dispatcher" goes on the map's Notes as a standing MVP
assumption, scoped per ticket 20's forward-compatible-subset guardrail: **the write path stays
correct for many dispatchers; only the interface may assume one.** The conditional write already
satisfies this, so the guardrail is met rather than promised — a second dispatcher is an additive
change (re-introduce an advisory presence layer if ever wanted), never a fork.

**Domain-modeling impact: none.** No new terms; no existing term shifts meaning.

**No ADR.** The ticket said one was warranted "if a locking mechanism is adopted" — none is. A
conditional write is cheap to reverse, unsurprising to a future reader, and not the product of a
close trade-off, so it fails all three ADR tests.

**Amends:** ticket 15 (lock pill deleted, contended noun corrected), ticket 28 (Price approval
outcome write guarded). Ticket 34's caution from grilling — that a per-driver concurrency ceiling
would make same-driver contention real — **does not apply**, because with one dispatcher there is
no second writer to breach a ceiling concurrently. Ticket 37 does not depend on ticket 34.
