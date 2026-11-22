---
status: accepted
---

# Drivers are invited by an Edge Function, and deactivated rather than deleted

A dispatcher provisions a driver from the console by giving an email and a name. Auth emails the driver an invite carrying a one-time code, and the driver app turns that code, plus a password the driver chooses, into their first sign-in. Later sign-ins use only the password.

**An Edge Function, not an RPC, because inviting is the Admin API.** The Admin API needs the service-role key, which no browser may hold. The `invite-driver` function does as little with that key as it can. It first asks `console_profile()` the same question the console asks after sign-in, using the caller's own JWT, so only an active dispatcher gets past it. Everything else a dispatcher may know about drivers is still read through RPCs, under the dispatcher's JWT.

**Create first, then invite.** The function creates the user with the role and name in app metadata, so the profile belongs to a driver from the start. Inviting directly would create the user with only user metadata, which makes them a customer until something corrects it. GoTrue writes the app metadata in a second statement, and `app.settle_profile_from_app_metadata` picks it up. Inviting an existing, unconfirmed user sends the invite to them as they are. If the invite can't be sent, the created user is deleted: no invite means no way in, so nothing is left half-provisioned.

**Accepting the invite.** The invite code signs the driver in once, and the password they set is what every later sign-in uses. If setting the password fails, the code is already spent and nothing on screen holds the session, so the session is dropped.

**Deactivation, never deletion.** Deactivating a driver takes them off duty, clears their push token and bans them from signing in again (Auth answers their password with `user_banned`). The driver stays on the console's list, so it's never a deletion.

**The console re-reads the driver list on a timer.** Drivers go On and off duty from their phones, not from the console, so the list is fetched every 30 seconds as well as after the console's own writes.
