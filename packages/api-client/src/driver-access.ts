import type { Database } from "@courier/domain";
import { ApiError, type CourierClient } from "./client.js";

const SIGN_IN = "sign_in";
const ACCEPT_INVITE = "accept_invite";
const SET_PASSWORD = "set_password";
const GO_OFF_DUTY = "go_off_duty";
const GO_ON_DUTY = "go_on_duty";
const DRIVER_PROFILE = "driver_profile";

const REFUSED = "42501";
const BANNED = "user_banned";

type DriverRow = Database["public"]["Functions"]["go_on_duty"]["Returns"][number];

export interface DriverCredentials {
  readonly email: string;
  readonly password: string;
}

export interface DriverInvite {
  readonly email: string;
  readonly code: string;
  readonly password: string;
}

export interface Driver {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly onDuty: boolean;
  readonly onDutyChangedAt: string | null;
}

export type DriverAccess =
  | { readonly status: "signed-out" }
  | { readonly status: "driver"; readonly driver: Driver }
  | { readonly status: "refused" };

export async function signInAsDriver(
  client: CourierClient,
  credentials: DriverCredentials,
): Promise<DriverAccess> {
  const { error } = await client.auth.signInWithPassword(credentials);
  if (error?.code === BANNED) return { status: "refused" };
  if (error) throw new ApiError(SIGN_IN, error);

  return askAsDriver(client, GO_ON_DUTY);
}

export async function acceptDriverInvite(
  client: CourierClient,
  { email, code, password }: DriverInvite,
): Promise<DriverAccess> {
  const verified = await client.auth.verifyOtp({ email, token: code, type: "invite" });
  if (verified.error) throw new ApiError(ACCEPT_INVITE, verified.error);

  const updated = await client.auth.updateUser({ password });
  if (updated.error) {
    await client.auth.signOut({ scope: "local" });
    throw new ApiError(SET_PASSWORD, updated.error);
  }

  return askAsDriver(client, GO_ON_DUTY);
}

export async function resumeDriverSession(client: CourierClient): Promise<DriverAccess> {
  const { data } = await client.auth.getSession();
  if (!data.session) return { status: "signed-out" };

  return askAsDriver(client, DRIVER_PROFILE);
}

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
