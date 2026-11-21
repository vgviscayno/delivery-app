---
status: accepted
---

# Rules the client runtimes force on shared code

The console runs in browsers. The mobile apps run on Hermes, inside Expo builds. Each has constraints that shape code in `packages/`, and that would be easy to "fix" back into a bug.

**The Shop clock is read once, and a foreign time zone is refused.** Every surface reads the Shop clock (GLOSSARY) from `server_clock()` and shows what it's told. It reads once rather than polling, because the clock only ever answers "what time is it now" and nothing watches it change, so a read per second per open screen would be calls spent on a question nobody asked again. `toServerClock` throws if the server reports any zone but `TIME_ZONE`. A mismatch means the database isn't the one we think it is, and every time rule downstream would be wrong in a way nobody would notice. A failed read is shown as a failure, never as a time that has quietly stopped. `TIME_ZONE` is exported only so a client can name the zone it's rendering, never so it can work out the delivery day itself.

**Money is parsed and formatted on digits.** Pesos typed into the console (`50`, `50.5`, `₱1,250.00`) become whole centavos by working on the digits, not by multiplying a float, so `0.29` is 29 centavos and not 28.999…. `formatPeso` builds `₱1,150` or `₱575.50` from digits rather than `Intl`, so Hermes builds without full ICU format it the same way. The rounding rule itself is ADR 0004.

**Phone numbers use libphonenumber's full metadata** (`libphonenumber-js/max`). The default build checks only a number's length, not whether its digits belong to a real Philippine range. Numbers are stored in E.164 (`+639171234567`). The customer app's phone field fixes `09` on screen and the customer types the 9 digits after it.

**Expo env vars are written out in full.** Expo inlines `process.env.EXPO_PUBLIC_*` only where the full name is written out, so passing `process.env` itself to `readBackendEnv` would give it an empty object in a real build. Each app reads each variable by name. Vite does the same for `VITE_*` in the console, and the console reads one `.env.local` at the repo root, shared with the db scripts.

**Mapbox's token is set once, before any map mounts.** The shared map style carries no token. The native SDK resolves `mapbox://` URLs with the public token from `EXPO_PUBLIC_MAPBOX_TOKEN`. Mapbox v11 no longer needs a download token at build time.

**OTA updates are matched to the native build by fingerprint**, so a JS update can never land on a binary whose native side (Transistorsoft, Mapbox) it wasn't built against.

**The mobile apps target Android only for now.** iOS, when it comes, is the customer app built from the same code (ADR 0013).
