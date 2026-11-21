---
status: accepted
---

# Storage uploads take a fresh path, and an orphan beats a broken link

Product photos and the QR Ph image live in Supabase Storage. Every upload takes a new path and never overwrites, and when a write fails part-way, the rule is to leave an orphaned file rather than risk a record pointing at a file that's gone.

**A fresh path per upload.** A Product photo goes in a new folder, `<uuid>/large.<ext>` and `<uuid>/thumb.<ext>`. A QR Ph image gets a new name each time. That way a phone or CDN that cached the old image never serves it again under the same URL.

**What gets removed, and when:**

- **Upload fails part-way:** whatever did upload is removed, so a failed upload leaves nothing behind.
- **The save after the upload fails:** nothing is removed, not even the new upload. The save may have reached the server with only the answer lost, in which case the Product already points at that upload. An orphaned file costs a little storage, while a removed one leaves a Product with a broken photo.
- **A replacement succeeds:** the old files are removed after the save, once nothing points at them. If that removal fails, the old files are just orphaned, and a replacement that worked is not reported as failed.
- **A Product is soft-deleted:** its photo stays, for the Orders that show it.

**No two Products share photo files.** Duplicating a row in the console, or filling a column down, never copies the photo. Replacing one Product's photo removes the old files, which would break any other Product that shared them.

**Photos are resized in the browser.** Supabase's own image transformations are paid-plan only (ADR 0012). The console makes a large image (1600 px wide, for a Product's own page) and a thumbnail (480 px wide, for the console grid and the shop's two-column list on a 2x phone). Each keeps its shape and is never enlarged. The height bound (twice the width) only applies to a photo more than twice as tall as it is wide, and it keeps the large image under the bucket's 2 MiB limit. The console encodes WebP where the browser's canvas really can, and JPEG otherwise. Safari's canvas silently returns PNG when asked for WebP, so support is tested by encoding, not assumed.

**The two buckets differ in who can read.** `product-photos` is public, so its links never expire. `shop`, which holds the QR Ph image, is private and is shown through signed links that last 300 seconds. That's long enough to load the image on screen, and nobody should be keeping these links.

## Consequences

- **Orphans pile up.** Nothing sweeps Storage for files that no row points at. That's #136.
