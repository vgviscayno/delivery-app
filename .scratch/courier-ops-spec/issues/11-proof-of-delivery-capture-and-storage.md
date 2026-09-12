# Proof of delivery capture and storage

Type: grilling
Status: resolved
Blocked by: 01, 05
Map: ../map.md

## Question

What does a driver capture at drop-off, and what happens to it?

Proof of delivery is what makes the terminal state of a job credible rather than a button press. It is also the only place in v1 where the system handles binary files.

Settle:

- What is captured: photo, signature, recipient name, a combination, or driver's choice. Whether any of it is mandatory before the job can close.
- Whether requirements vary by job, or are uniform across the business in v1.
- Capture UX on the driver app: camera integration, signature drawing, and how much friction is acceptable at a doorstep in the rain.
- Upload behaviour: does the job close immediately with the upload queued in the background, or does the driver wait. This intersects the offline fog directly — a driver in a basement car park must still be able to complete a delivery.
- Image handling: compression and resizing on-device before upload, since raw phone photos are large and couriers are on mobile data.
- Storage and access control: where files live, and how a customer is authorised to view only their own proof. Signed URLs, expiry, and whether the file is public-by-obscurity or genuinely gated.
- Retention, which should be decided alongside ticket 10 — a photo of someone's doorstep is personal data.
- Whether the capture is geo-stamped and time-stamped, and whether that stamp is trusted or merely recorded.

Blocked on ticket 01 for where this sits in the lifecycle, and on ticket 05 for the file storage story.

## Answer

- **Capture**: photo mandatory before a Delivery can be marked `Delivered`. Signature and recipient-name free-text field are available in the capture UI but optional — not gating.
- **Uniform across the business**: one fixed capture flow for every Delivery in v1, no per-job configuration.
- **Optimistic close, background upload**: the driver taps to complete, `courier_status` flips to `Delivered` immediately, and the photo upload is queued and synced in the background — mirroring the offline-buffering pattern from ticket 03. Known gap, accepted: a brief window can exist where a Delivery shows `Delivered` before its photo has actually reached Supabase Storage.
- **Image handling**: compressed and resized on-device before upload (target ~1600px max dimension, JPEG ~70-80% quality) — not the raw camera file.
- **Storage and access control**: private Supabase Storage bucket. Access is via signed URLs gated by an ownership check — customer can view only their own Delivery's photo, dispatcher can view all, driver can view their own captures — mirroring the fail-closed RLS pattern ticket 09 set for live location.
- **Retention**: 30 days after delivery, then automatic hard-delete via a scheduled job. No manual/on-demand deletion path in v1.
- **Geo/time-stamp**: capture is stamped with device time and GPS at time of capture, stored as metadata. Treated as recorded-for-context only, not trusted or server-verified — consistent with ticket 10's stance that device-reported location isn't authoritative. No cross-check against the dropoff address.
