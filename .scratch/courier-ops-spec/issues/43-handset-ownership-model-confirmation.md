# Confirm the handset ownership model: per driver or per vehicle

Type: task
Status: open
Blocked by: —
Map: ../map.md

## Question

A **task**, not a decision — one fact to confirm with the business owner, which two resolved tickets
are assuming.

Answering [ticket 34](34-driver-shift-and-availability-model.md), the owner wrote that the phone
"stays at the shop and vehicle." That reads two ways: **one handset per driver** (kept in their
vehicle during the day), or **one handset per vehicle** (used by whoever is driving it). Ticket 34
proceeded on *per driver* and recorded the assumption rather than blocking on it.

Why it matters — [ticket 09](09-auth-and-identity-across-three-surfaces.md) chose **long-lived
stay-signed-in sessions** for the driver app on the explicit reasoning that "signing in every shift is
pure friction with no offsetting benefit." That reasoning holds only if a handset belongs to a person.
If handsets are pooled per vehicle:

- **Sign-in becomes the clock-in**, and ticket 34's separate *Start work* tap is redundant — you
  cannot have a persistent session on a shared device, and whoever signs in is by definition starting
  work.
- The driver identity attached to a live position is the identity of whoever last signed in, which is
  the thing dispatch is actually reading off the map.
- Ticket 09's long-session decision needs amending, and ticket 34's decisions 1 and 3 (duty flag,
  end-of-day auto-off) need re-reading against a sign-out that already ends the session.

With two drivers and two vehicles the two models likely coincide in practice, which is why this is a
confirmation rather than a redesign — but they diverge the moment a driver takes a different van.

**HITL.** One question to the owner: *does each driver have their own phone, or does each vehicle have
a phone that whoever drives it uses?*

Record on resolution: the answer, and whether tickets 09 and 34 need amending as a result.
