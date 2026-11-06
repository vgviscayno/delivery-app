import type { Database } from "@courier/domain";
import { ApiError, type CourierClient } from "./client.js";

const SIGN_IN = "sign_in";
const ACCEPT_INVITE = "accept_invite";
const SET_PASSWORD = "set_password";
const GO_OFF_DUTY = "go_off_duty";
const GO_ON_DUTY = "go_on_duty";
const DRIVER_PROFILE = "driver_profile";

/** Postgres' insufficient_privilege, which every driver-app RPC raises to refuse. */
const REFUSED = "42501";
/** What Auth answers a deactivated driver's password with (`deactivate_driver` bans). */
const BANNED = "user_banned";

type DriverRow = Database["public"]["Functions"]["go_on_duty"]["Returns"][number];

/** What the driver types on the sign-in screen, after tapping their name. */
export interface DriverCredentials {
  readonly email: string;
  readonly password: string;
}

/**
 * A driver's first sign-in: the email they were invited at, the one-time code from the
 * invite email, and the password they are choosing.
 */
export interface DriverInvite {
  readonly email: string;
  readonly code: string;
  readonly password: string;
}

/** The driver a session on this phone belongs to. */
export interface Driver {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly onDuty: boolean;
  /** When `onDuty` last changed, by the server clock. Null if never On duty. */
  readonly onDutyChangedAt: string | null;
}

/**
 * Where a driver-app session stands. `refused` is an account that authenticated but
 * may not use the driver app -- a customer, a dispatcher, a deactivated driver. By the
 * time the app sees it, that account has already been signed out of this phone.
 */
export type DriverAccess =
  | { readonly status: "signed-out" }
  | { readonly status: "driver"; readonly driver: Driver }
  | { readonly status: "refused" };

/**
 * Signs in to the driver app, which is going On duty. Wrong credentials throw an
 * `ApiError`; an account that is not an active driver is signed straight back out.
 */
export async function signInAsDriver(
  client: CourierClient,
  credentials: DriverCredentials,
): Promise<DriverAccess> {
  const { error } = await client.auth.signInWithPassword(credentials);
  if (error?.code === BANNED) return { status: "refused" };
  if (error) throw new ApiError(SIGN_IN, error);

  return askAsDriver(client, GO_ON_DUTY);
}

/**
 * A driver's first sign-in. The invite code signs them in once; the password they
 * choose is what every later sign-in uses. Then, like any sign-in, it goes On duty.
 */
export async function acceptDriverInvite(
  client: CourierClient,
  { email, code, password }: DriverInvite,
): Promise<DriverAccess> {
  const verified = await client.auth.verifyOtp({ email, token: code, type: "invite" });
  if (verified.error) throw new ApiError(ACCEPT_INVITE, verified.error);

  const updated = await client.auth.updateUser({ password });
  if (updated.error) {
    // The code is spent and nothing on screen holds this session; keep none.
    await client.auth.signOut({ scope: "local" });
    throw new ApiError(SET_PASSWORD, updated.error);
  }

  return askAsDriver(client, GO_ON_DUTY);
}

/**
 * Picks up a session the phone stored earlier. Resuming is not signing in, so it
 * changes nothing on the server -- but it re-asks who the session belongs to, because
 * the driver may have been deactivated since.
 */
export async function resumeDriverSession(client: CourierClient): Promise<DriverAccess> {
  const { data } = await client.auth.getSession();
  if (!data.session) return { status: "signed-out" };

  return askAsDriver(client, DRIVER_PROFILE);
}

/**
 * Signs out, which takes the driver off duty. The server is told first: if it cannot
 * be, the session is kept and this throws, because a phone that let go without saying
 * so would leave the dispatcher seeing the driver On duty. An account that is no
 * longer a driver has nothing to come off, and is let go regardless.
 *
 * The session is then ended on the server, every refresh token with it, so nothing
 * copied off the phone can keep minting access tokens. Signing out is the person
 * leaving work, not one phone forgetting them. If that call fails the driver is still
 * off duty, and this phone lets go all the same.
 */
export async function signOutAsDriver(client: CourierClient): Promise<void> {
  const { error } = await client.rpc(GO_OFF_DUTY);
  if (error && error.code !== REFUSED) throw new ApiError(GO_OFF_DUTY, error);

  const ended = await client.auth.signOut({ scope: "global" });
  if (ended.error) await client.auth.signOut({ scope: "local" });
}

async function askAsDriver(
  client: CourierClient,
  operation: typeof GO_ON_DUTY | typeof DRIVER_PROFILE,
): Promise<DriverAccess> {
  const { data, error } = await client.rpc(operation);

  if (error?.code === REFUSED) {
    await client.auth.signOut({ scope: "local" });
    return { status: "refused" };
  }

  const row = data?.[0];
  if (error || !row) {
    await client.auth.signOut({ scope: "local" });
    throw new ApiError(operation, error ?? { message: "the server returned no driver" });
  }

  return { status: "driver", driver: toDriver(row) };
}

function toDriver(row: DriverRow): Driver {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    onDuty: row.on_duty,
    onDutyChangedAt: row.on_duty_changed_at,
  };
}
