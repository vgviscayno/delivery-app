# Install-free tracking link for one-off recipients

Type: grilling
Status: resolved
Blocked by: 01
Map: ../map.md

## Question

Does v1 include a no-install web tracking page for people who receive a delivery but never booked it?

Charting settled that customers are repeat accounts, so an app install is acceptable **for the person who books**. This ticket asks the question that answer left open: whether the person at the door is the same person, and what they get if not.

Settle:

- Whether a recipient distinct from the booking customer exists in this business at all. If not, close this and record it in Out of scope — that would also remove an actor from the domain model.
- If recipients do exist, what they currently get. Nothing, an SMS, an email, a phone call from the driver.
- Whether a signed, expiring tracking URL is worth a fourth surface in v1. It is a thin surface — read-only map, one job, no auth beyond the link — but it is still a web app to build, style, and host, and it duplicates the map integration.
- If included: link generation and delivery (SMS costs money per message; email is free but slower to be seen), expiry policy, and what the page shows after the delivery completes.
- The security shape of an unauthenticated link that exposes a live human's position. Guessability, expiry, and revocation all matter more here than on an authenticated surface.

**A cost argument arrived from ticket 02.** Mapbox bills native maps by monthly active user (25k free) but web by map load (50k free). A tracking *page* is therefore materially cheaper per viewer than a tracking *app* — so if the customer base ever approaches 25k MAU, this web surface stops being a nicety and becomes the pressure valve. That doesn't decide v1, but it means "build it later" has a threshold attached rather than being indefinite.

Blocked on ticket 01, because whether "recipient" is a distinct entity is a domain-model question and should be answered there first.

## Answer

**Out of scope for v1** — no install-free tracking page. Confirmed with the domain owner: in this business the account holder who books is always the one who receives the delivery; a distinct recipient actor doesn't exist today. That collapses the rest of this ticket's questions (link delivery, expiry policy, unauthenticated-link security) since none of them apply without a recipient to serve.

This is a plausible future feature — delivery to someone other than the account holder (gifting, third-party recipients) — but adding it would reopen the domain model (recipient becomes a real entity) and the Mapbox MAU-vs-load cost trade-off ticket 02 surfaced. It returns as a fresh effort against a redrawn destination, not a resumption of this ticket.
