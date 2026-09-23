---
status: accepted
---

# No staging environment, and the pilot runs on production

There are three backends: local (the Supabase CLI in Docker), one Supabase preview branch per PR, and production. There is no standing staging project. The pilot runs against production, and the driver app's pilot is an unlicensed debug build sideloaded onto the shop's managed phones. It moves to managed Google Play only when the shop decides to keep the system.

**No staging, because a standing staging project is a third thing to migrate, re-seed and hold credentials for.** It is also where fail-closed RLS tends to quietly stop being fail-closed. Preview branches give each PR a disposable backend with its own Auth, Storage, Realtime and Edge Functions, seeded from `seed.sql` and never copied from production. Environments are separate Supabase projects, never schemas in one project, because Auth, Storage and Realtime belong to a whole project and a schema split would share one login table.

**The pilot runs on production because "pilot" controls who can install the app, not which backend it talks to.** The customer app's pilot is Play's closed-testing track, on the same package and signing key, promoted to production when it's ready. A closed-testing build pointed at a separate backend couldn't be promoted without swapping its database underneath it. The pilot's data is the shop's data.

**The driver pilot is sideloaded to defer the $399 Transistorsoft licence until the shop knows it wants the system.** Transistorsoft is free in debug builds (map ticket 19), but Play rejects debuggable uploads on every track, including managed-Play private apps. So during the pilot the MDM policy allows installs from outside Play (`untrustedAppsPolicy: ALLOW_INSTALL_DEVICE_WIDE`, USB debugging still off). The APK is served from a private Supabase Storage bucket through the version gate's update screen, to logged-in drivers only.

## Considered options

- **A standing staging project**, Supabase's own recommended pattern. Rejected for the upkeep and the RLS drift described above.
- **Buying the licence up front** and shipping the driver pilot as a release build through managed Play. Rejected on cost: ₱20,000+ is a lot for a system still being tried out.
- **AMAPI `installType: CUSTOM`**, which pushes a self-hosted APK through the MDM. Rejected because it needs a companion extension app we'd write ourselves, for a channel thrown away at launch.
- **Pilot phones left unmanaged.** Rejected because it loses the MDM-granted background location permission (map ticket 18).

## Consequences

- **Deciding to keep the system is a cutover, not a flag flip.** Buy the licence, publish the driver app as a managed-Play private app, and tighten the policy back to `DISALLOW_INSTALL`. A debug build and the Play build are signed with different keys, so Play can't install over the sideloaded app. Each phone is uninstalled and reinstalled at end of day, once Transistorsoft's offline queue has drained.
- **The pilot APK is a plain `debug` build pointed at production** with `-Pbackend=production`. A custom `pilot` buildType would risk switching Transistorsoft's licence check on without anyone noticing. `release` builds are hard-wired to production, and `debug` defaults to local.
- **No over-the-air updates for the driver app during the pilot.** The overnight `AUTO_UPDATE_DEFAULT` path starts only after the cutover. Until then the version gate blocks old builds and links to the bucket.
- **Nothing can be tried on real data before it reaches real customers.** Preview branches test migrations, never data. The version gate and the kill-switch flags are what's left for pulling back a bad release.
