---
status: accepted
---

# Every app asks the server who signed in, and keeps phone sessions encrypted

Customers, drivers and dispatchers all sign in to the one Supabase Auth instance. Authenticating proves only that an account exists, so each surface then asks the server who the account is: `console_profile()`, or the customer or driver equivalent. Anything except an active account of that surface's kind is signed straight back out, and the surface reports `refused`. By the time a screen sees `refused`, the session has already been dropped on that device.

**Resuming is re-asking.** A session stored earlier (in the browser's localStorage, or SecureStore on a phone) is picked up and the server is asked again, because the account may have been deactivated in between. If the server can't vouch for a session, the session is dropped, not kept on trust. Resuming a driver's session changes nothing on the server: resuming is not signing in, and signing in is what puts a driver On duty.

**The session follows supabase-js.** When supabase-js lets a session go on its own, because a refresh token stopped working after deactivation or a sign-out everywhere, the screen signs out too (`onSignedOut`). In the console another tab signing out has the same effect.

## Sign-out has a different scope on each surface

- **Console: this browser only** (`scope: "local"`). Signing out everywhere would also end the dispatcher's session on every other machine, and an idle tab has no business doing that.
- **Customer: everywhere** (`scope: "global"`). Every refresh token ends with the session. If the server can't be reached, the phone drops the session anyway.
- **Driver: tell the server first.** Signing out takes the driver off duty. If the server can't be told, the session is kept and sign-out fails, because a phone that let go silently would leave the dispatcher seeing the driver On duty. After that the session ends globally, so a refresh token copied off the phone can't keep minting access tokens: signing out means the person leaving work, not one phone forgetting them. An account that is no longer a driver has nothing to come off, and is let go regardless.

## Phone sessions

- **Kept in SecureStore, split into chunks.** SecureStore encrypts each value with a key held in the Android Keystore, which keeps the refresh token encrypted at rest, but it caps a value at 2048 bytes. A supabase-js session (two JWTs and the user) is larger, so `createChunkedStorage` splits each value across numbered entries of 500 code points (at most 2000 bytes in UTF-8, and never splitting a surrogate pair), with the count under the key itself. Since one value takes several native calls, the calls on each key run in turn. Two writes can't interleave into a value that reads back as nothing, and a write can't land after a removal that followed it.
- **Out of Android's cloud backup.** The `expo-secure-store` config plugin keeps these values out of backup, which could otherwise restore them onto a phone whose Keystore can't decrypt them.
- **The driver's survives a locked phone.** Driver storage uses `AFTER_FIRST_UNLOCK`, because background location work will run while the phone is locked in the van.
- **The token refreshes only in the foreground.** supabase-js refreshes on a timer, which a backgrounded app can't keep, so `refreshWhileActive` runs it only while the app is active, as Supabase advises for React Native. A native app has no URL for a session to arrive in, so `detectSessionInUrl` is off.

## Driver phones belong to the vehicles

The phones belong to the vans and bikes, not to the drivers. So the driver app remembers who has signed in on it (the 8 most recent names) and offers them on the sign-in screen. A driver taps their name and types only a password. The list holds no credential, only enough to save typing an email. If the stored list can't be read, it's treated as empty.

## The customer's cart lives in one slot on the phone

The cart is kept in SecureStore in **one slot, tagged with whose cart it is**, not one key per user. When the server ends a session, the app no longer knows whose cart it would be clearing, so it clears the single slot on every sign-out. A resume that fails (offline, say) is not a sign-out: the cart stays, and only its owner will see it again. A slot that won't parse, because it's in an older format or half-written, counts as an empty cart. A customer can re-add a line more easily than they can spot one that came back wrong.

Each cart line keeps a snapshot of the Product's name and price from when it was added, so the total shows without the network. This is the cart's own copy, separate from the Order snapshot in ADR 0003.

## The console signs an idle dispatcher out itself

The console signs a dispatcher out after `VITE_DISPATCHER_IDLE_MINUTES` (30 by default) without activity. Supabase Auth's inactivity timeout is a Pro-plan setting (ADR 0012), and it would apply to every account, while customers are meant to stay signed in for good.

- **Activity is recorded in localStorage**, so every console tab shares one idea of idle (typing in one tab keeps the others alive), and a session restored after the browser was closed is judged by when it was last used. A stored session with no record of activity is treated as idle, so a browser closed mid-shift doesn't reopen straight into the console hours later. Each deliberate sign-out clears the record.
- **Activity is a pointer press, a key, the wheel or a touch.** Moving the pointer alone doesn't count.
- **This is the browser's clock, not the Shop clock.** It measures elapsed time on one machine, not a shop rule. The check runs every 10 seconds and again the moment a hidden tab becomes visible, for a laptop lid closed past the timeout.

## Considered options

- **Trusting the JWT's role claim on the client.** Rejected: a deactivated account still holds a valid JWT until it expires, and only the server knows it's deactivated.
- **One key per user for the cart.** Rejected for the sign-out reason above.
