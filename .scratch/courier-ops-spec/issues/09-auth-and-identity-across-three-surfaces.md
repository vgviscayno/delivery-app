# Auth and identity across three surfaces

Type: grilling
Status: resolved
Assignee: agent-session
Blocked by: 01, 05
Map: ../map.md

## Question

Who can sign in to what, how do they get an account, and what can each actor see?

Three actor types with genuinely different lifecycles share one system, and conflating them is a common and expensive mistake.

Settle:

- **Drivers:** employees, so accounts are provisioned by the business rather than self-registered. Who creates them, how a driver first signs in, how a leaving driver is deactivated, and what happens to their history.
- **Dispatchers:** internal staff, likely with elevated permissions. Is there an admin tier above dispatcher, and does the console need role separation in v1.
- **Customers:** repeat accounts, self-registered or invited. Email, phone, or social sign-in — noting that phone-based auth costs money per SMS and email adds a deliverability dependency.
- Whether one identity system serves all three or the internal and customer sides are deliberately separate.
- The authorisation rules that matter most here: a customer may read the position of a driver **only** while that driver is running that customer's job. That is a time-bounded, relationship-derived permission and it is the security crux of the whole product — live location is sensitive data.
- Session lifetime on each surface. A driver signing in every shift is friction; a dispatcher console left open on a warehouse screen is a risk.
- Token refresh on mobile, particularly for a backgrounded app that must keep posting location.

**Ticket 04 sharpened the crux above into a platform property.** Supabase RLS, Firebase Rules, and Ably capability tokens can express "customer reads this driver's position only while that driver runs that customer's job" declaratively, and **fail closed** — a missing rule denies access. Convex explicitly rejects RLS in favour of in-function checks, and a custom server is the same shape: both **fail open**, so one forgotten check silently exposes a live person's location. Given the data involved, that failure mode deserves weight in ticket 05 rather than being treated as a stylistic preference.

Blocked on ticket 01 for the actor and relationship vocabulary, and on ticket 05 because the platform may supply auth outright.

## Resolution

**One Supabase Auth instance for all three actors**, distinguished by a `role` column (`dispatcher` | `driver` | `customer`) on a `profiles` table keyed to `auth.users`. Keeps RLS policies uniform — every policy checks `auth.uid()` against `profiles.role` and the relevant relationship in one place.

**Customer sign-in: email + password.** No phone/SMS (per-message cost), no social login (OAuth setup overhead) for the MVP.

**Driver accounts are provisioned by the dispatcher**, not self-registered — dispatcher enters an email, which calls the Supabase Admin API to create the `auth.users` row plus an invite link; first sign-in is the driver setting their password. Deactivation is a soft flag (`profiles.active` / `deactivated_at`), not a row delete, so delivery history stays attributable after a driver leaves. Whether a dispatcher-console UI exists for this in the MVP, or it's seeded directly, is left to ticket 15.

**Dispatcher role: flat, no admin tier for v1.** A second internal role would multiply the permission matrix without adding anything visible to a live demo.

**Security crux — customer reads a driver's position only while that driver runs that customer's job — is an `EXISTS` subquery in the RLS `SELECT` policy** on the position/location table: matches when a `deliveries` row exists with the matching `driver_id`, `customer_id = auth.uid()`, and `courier_status` in the active set (`Assigned`, `Picked up`). Access revokes automatically as `courier_status` advances past that set — no separate revoke step, falls out of the ticket 01 state machine. Fail-closed: no match, no access, by Postgres default. Correctly scoped per-Delivery, so a driver's other concurrent Deliveries (ticket 01's multi-stop dispatch) stay invisible to a customer who isn't party to them.

**Session lifetime:** long-lived (stay-signed-in) sessions for driver and customer apps — signing in every shift or every order is pure friction with no offsetting benefit. Dispatcher console gets a shorter idle-timeout session, since it's the one surface the ticket flags as a risk (an unattended warehouse screen) and the only one with cross-driver/cross-customer visibility.

**Token refresh:** relies on the Supabase client's built-in auto-refresh, persisted via secure storage, running through the background-geolocation library's periodic JS wake-ups (ticket 03) so it fires even while backgrounded. Access-token lifetime is far longer than the driver app's wake cadence, so refresh should never actually block a position post in practice. If a refresh itself fails mid-background (network blip), ticket 03's existing SQLite fix-buffering is the backstop — it queues position data independent of auth state and flushes once a valid session resumes.
