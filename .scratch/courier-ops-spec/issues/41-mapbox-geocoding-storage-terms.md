# May Mapbox geocoding results be stored permanently?

Type: research
Status: resolved
Blocked by: —
Map: ../map.md

## Question

Ticket 33 stores `formatted_address` — the output of a Mapbox **Geocoding** or **reverse-geocoding** call — permanently on every saved Address, and then **copies it again** onto every Order as part of the delivery-address snapshot (ADR 0003's extension). That is permanent storage of vendor geocoding output, duplicated per Order, retained for the life of the order ledger.

Mapbox's terms have historically restricted permanent storage of geocoding results by plan tier, with a distinction between *temporary* caching and *permanent* storage, and separate permanent-storage entitlements sold as an add-on. If that restriction applies at the free tier this map assumes, ticket 33's record shape has a licensing problem — the same class of question tickets 17 and 19 had to answer for Transistorsoft, and one this effort has a habit of finding late.

Find, from Mapbox's own current terms of service and pricing pages (primary sources only):

- **Does the Geocoding API's free/standard tier permit permanent storage** of `place_name`/`formatted_address` strings and the returned coordinates? Is there a temporary-cache-only clause, and if so what is the permitted window?
- **Does storing the coordinate differ from storing the string?** Ticket 33 makes the *pin* authoritative, and in the pin-drop path the coordinate is the customer's own input, not Mapbox's output — does that change the analysis for that path?
- **Is a permanent-storage entitlement available, at what price**, and does it require leaving the free tier?
- **Does the same restriction reach ticket 23's Directions calls** (road-distance radius checks)? Ticket 23 stores no Directions output today — confirm that stays true and is the reason it is unaffected.
- **What does the cheapest compliant record shape look like** if permanent storage is *not* permitted — e.g. store only the customer-placed pin plus customer-typed free text, and re-geocode for display?

Note the interaction with ticket 33's pin-drop escape hatch: an address entered by dropping a pin has a *reverse*-geocoded string, which may sit differently in the terms than a forward-geocoded one.

**Amends if restrictive:** ticket 33's record shape; possibly ticket 02's vendor choice.

## Answer

**Yes, ticket 33 has a real licensing problem — and yes, it has a cheap fix.** Full findings, with clause citations: [`research/mapbox-geocoding-storage-terms.md`](../research/mapbox-geocoding-storage-terms.md).

### Where the terms actually live

`mapbox.com/legal/tos` contains **no geocoding storage clause at all**. Everything operative is in the **Product Terms PDF** (July 21, 2026) linked from `mapbox.com/legal/product-terms`. Reading the ToS alone leads to the wrong conclusion that storage is unrestricted — worth recording, because that is the trap this ticket was written to check for.

### Verdicts

1. **Permanent storage at the free tier: no — and there is no cache window.** Product Terms §2.7.2: *"Customer shall not export, store, or cache Temporary Geocodes."* Zero days, not thirty. §3.71 makes every response a Temporary Geocode unless it was explicitly requested as permanent. The 30-day clause people half-remember is §2.8.1 and governs **map tiles** cached on-device, not Search APIs. Crucially the restriction is gated on **request mode, not plan tier** — being on the free tier is not what causes the problem, and leaving it is not what fixes it.

2. **Coordinate vs string: identical for storage.** §3.30 defines a "Geocode" as *the response*, whole — the string and the lat/lng are one governed object. They differ only on **display**: §2.7.2 permits displaying a temporary result *"other than the latitudes and longitudes."* The **pin-drop path does escape** for the coordinate: a customer-placed pin is not a Search API response, and §1.19 expressly preserves data the customer holds independently. **Caveat that bites ticket 33's main flow:** in *search → confirm pin*, a pin the customer confirms **without moving** is still a copy of a Temporary Geocode's coordinates. The escape hatch covers a genuinely dropped pin, not the default happy path.

3. **Reverse vs forward geocoding: no difference.** Same `permanent` parameter on both v6 endpoints, same terms language, and the paid SKU covers *"forward and reverse."* Dropping a pin frees the **coordinate**, never the reverse-geocoded **string**.

4. **A permanent entitlement exists: $5.00/1,000 requests, no free allowance, billed from request #1** ($4.00/1k above 500k). In v6 the endpoints merged — `permanent=true` replaced v5's `mapbox.places-permanent` mode — but **billing is still split**. Access is gated on *"a valid credit card on file **or** an active enterprise contract"*: **a card is sufficient**, no enterprise Order required, and every other free tier on the account survives untouched. §2.7.3's condition list (i)–(iv) attaches only to end-user-facing use; internal business use is granted unconditionally by that section's first sentence.

5. **Directions is caught too, and harder.** §2.10.1: *"Customer shall not export, download, cache or store results from any request to a Navigation API."* Directions is documented under `/api/navigation/`, so §3.51 catches it. Unlike geocoding there is **no paid unlock and no temporary/permanent split** — storage is prohibited at every tier, at any price. **Ticket 23 storing nothing is therefore a hard licensing requirement, not a design preference.** Ticket 23 stands, with that reason substituted for the incidental one: persist the radius **verdict** (a derived business fact, and one ticket 33 already decided not to persist at all) — never the returned distance in metres.

6. **Re-geocode-on-display is viable but wrong.** The 100k/month free temporary allowance covers this volume comfortably, so cost is not the objection. Two other things are: it breaks the driver's offline case, and it **destroys the ADR 0003 snapshot** — a historical Order's address would silently mutate as Mapbox's data changed, which is precisely what snapshotting exists to prevent. Not worth it to avoid a bill under $15/month.

### What changes

Three changes, all small:

1. **Set `permanent=true` on every geocode call**, forward and reverse. This is the whole fix for ticket 33's record shape — `formatted_address` may then be stored on the Address and copied onto the Order snapshot exactly as ticket 33 designed.
2. **Drop Search Box.** It has **no permanent mode at any price** (*"only available for temporary use"*). Ticket 33's search step must use **Geocoding v6 forward**, not Search Box or any Search JS component backed by it. This is the only real design casualty.
3. **Put a card on the Mapbox account.** Budget **~$5–15/month**. No enterprise contract, no plan migration.

Plus one **UI constraint independent of storage**: §2.7.1(b) and §2.7.3(iv) forbid displaying raw lat/lng to end users. Check the dispatcher console and any admin/debug surface — this is a display rule, and it applies to temporary results regardless of the permanent purchase.

### What does not change

**Ticket 02's vendor choice is not in question.** The fix is one query parameter and a payment card, at a cost that rounds to nothing at this scale. Nothing here argues for leaving Mapbox.
