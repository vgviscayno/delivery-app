# Dispatcher packing and price-approval screen

Type: prototype
Status: resolved
Blocked by: 26, 27, 28
Map: ../map.md

## Question

Tickets 27 and 28 settled everything *behind* this screen — the pricing record, the tolerance rule, the approval gate, the three customer answers, what each surface shows. Nothing about what the dispatcher actually looks at while packing has been decided, and it is a **how-does-it-look/feel** question: build it with `/prototype` and link the artifact here.

Graduated from the map's fog on resolution of ticket 28, which supplied the missing piece — what a breach triggers.

The prototype should let the user react to:

- **The packing surface itself.** A per-Order packing checklist: which lines need a weight typed, which are per-unit and need nothing, what's already done. How a dispatcher gets *to* it — ticket 15 settled a map-dominant console with a floating job-queue drawer and never contemplated a prep surface at all. Is packing a panel in that drawer, a full-screen mode, or a separate route? This is the crux of the layout question.
- **Typing a packed weight.** Grams as the unit (ticket 27). Read off the scale by eye — assume no scale integration, but note whether the design would obviously want it later. What the input looks like against the customer's estimate sitting next to it.
- **The breach moment.** A tolerance breach is knowable the instant the weight is typed. How is it signalled *right there* — inline on the line, a running Order-level banner, nothing until the dispatcher tries to mark `Ready`? Try variants: the packer may be a different person from whoever makes the call.
- **The `Ready` gate.** `Ready` means packed *and* priced — every per-weight line has a weight. How does the screen show what's still missing, and what does the blocked `Ready` action say?
- **Running the approval call.** The dispatcher is on the phone (ticket 28). What do they have in front of them: itemised provisional-vs-final per line, the three actions (approve / decline specific lines / reject-and-cancel), the optional note field. How does declining lines read — checkboxes on breaching lines only, since non-breaching lines can't be declined?
- **The held-Order state.** How an Order awaiting approval appears back in the job queue, and how a dispatcher returns to an unanswered call later (ticket 28 chose an indefinite hold with the age badge as the pressure).

Keep it throwaway — seeded Orders with a mix of per-unit and per-weight lines, at least one clean, one in excess, one in shortfall. No backend.

**Domain-modeling impact:** none expected — consumes ticket 27's pricing terms and ticket 28's Price approval, adds nothing.

Deliver: the chosen packing-screen layout and where it lives relative to ticket 15's console, the breach-signalling treatment, and the approval-call surface — with the prototype linked as an asset.

## Asset

[Prototype — three variants](../prototypes/31-dispatcher-packing-and-approval.html) (open in a browser; cycle with ← / →, type packed weights in grams):

- **A — Packing tab in the console drawer.** Packing lives inside ticket 15's map-dominant console as a second tab on the floating drawer; the map never leaves. Breach signals inline the instant a weight is typed. The approval call runs in the same drawer panel.
- **B — Full-screen packing bench.** A separate mode beside Dispatch, map gone, wide table with a to-pack queue. Deliberately quiet per-line: no breach signal while typing — everything surfaces at the `Ready` gate as a review sheet.
- **C — Scale keypad + separate call queue.** One line at a time on a large keypad card sized for someone at the scale; a breach blocks right there and the packer's only move is to hand off. The call is worked from a distinct `Calls` surface with a per-direction script.

Seeded: `O-113` all-per-unit (nothing to weigh), `O-104` packs clean, `O-107` heading for an excess, `O-111` for a shortfall, `O-098` already held awaiting a call (one breaching line, one within tolerance and therefore not declinable).

## Answer

**Variant B — the full-screen packing bench — with A's blocked-reason treatment folded in.** Packing is its own mode beside Dispatch, not a panel inside ticket 15's console.

### Where the packing surface lives

A **separate full-screen mode**, reached from a Dispatch / Packing-bench switch in the console top bar. The map is gone entirely while packing. Rejected: a second tab on ticket 15's floating drawer (variant A) — 430 px is too narrow for a five-line Order showing estimate, packed weight, delta and line total side by side, and it forces packing to compete with the map for a screen that packing doesn't need. Also rejected: a per-line keypad wizard with a separate call queue (variant C) — it commits hard to a two-person shop, which isn't reliably true here.

Layout: a left-hand **To pack** queue, a wide line table (line / estimate / packed / delta / line total), and a footer carrying the totals and the `Ready` action. Ticket 15's console is untouched — this ticket adds a mode, it doesn't amend the console's layout.

**Accepted trade-off:** a dispatcher in packing mode cannot see the fleet map. Judged acceptable because packing is a bounded task at a physical bench, and the mode switch is one click — but it is the reason the bench must never become where a dispatcher lives all day if the same person also dispatches.

### When a breach announces itself — deferred, but not silent

The shop is **sometimes one person and sometimes two** (settled with the user during this ticket): the packer may or may not be the person who phones. That rules out both extremes.

- **The `Ready` gate is the only place a breach is actionable.** Nothing per-line demands attention while weighing: no red input, no banner, no running alarm. Pressing `Mark Ready` on an Order with a breach opens a **review sheet** listing every per-weight line, breaching ones tickable, in-tolerance ones shown but explicitly not declinable.
- **A quiet inline footnote helps the solo case.** A breaching line's Delta cell reads `+350 g` with a muted `outside ±250 g` beneath it — enough for a packer working alone to catch a misread scale before committing, in typographic weight low enough that a dedicated packer isn't being nagged toward a number.

This asymmetry is the whole point: **information inline, decision at the gate.** An immediate alarm invites the packer to adjust the weight until the warning stops, which is exactly what the tolerance record exists to detect.

### The `Ready` gate

`Ready` means packed *and* priced (ticket 27), so the button is disabled until every live per-weight line has a weight. **A's treatment won here over B's original**: the reason sits in amber immediately to the left of the button — *"2 lines still need a packed weight — **Ready** means packed *and* priced"* — not as dim text at the far end of the footer. Proximity and colour are what make a disabled button legible rather than broken-looking.

### Running the approval call

A **modal review sheet over the bench**, opened by the blocked `Ready` press or by re-entering a held Order. It carries: the customer's number, every per-weight line as `~est → packed` and `provisional → final` with the gram delta, a checkbox on **breaching lines only** (in-tolerance lines render greyed with "within tolerance, cannot be declined"), the revised total with the delivery fee broken out and labelled *never moves*, an optional note field, and the three actions — **Approve as packed** / **Decline ticked lines, keep the rest** / **Reject & cancel**.

Ticking every line and declining resolves to the same cancellation as Reject, per ticket 28 — the prototype routes it there rather than offering an empty Order.

### The held state

A held Order is **split out of the To-pack queue into its own `Awaiting price call` section** at the foot of the left rail — red left-edge, the customer's phone number in place of a weighed count, and the age badge reading *"waiting 46m"*. It is a different kind of work item (there is nothing left to pack; there is a call to make), so it gets its own list rather than a label on a packing row.

Re-entering one shows the bench read-only-ish with the amber blocked reason beside an **Open approval call** button. Ticket 28's indefinite hold is respected — the waiting badge is the only pressure, and nothing times out.

### Notes for implementation

- **Scale integration** would drop straight into the packed-weight input with no layout change. Not in scope; the design doesn't foreclose it.
- Ticket 15's dispatch queue still needs the "awaiting price confirmation" treatment with the Assign action disabled and the reason stated — that was already decided in ticket 28, and this ticket doesn't change it.
- **Domain-modeling impact: none**, as predicted. No new terms, no ADR.

