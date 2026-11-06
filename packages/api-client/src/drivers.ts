import { ApiError, type CourierClient } from "./client.js";

const DISPATCHER_DRIVERS = "dispatcher_drivers";
const DEACTIVATE_DRIVER = "deactivate_driver";
const INVITE_DRIVER = "invite-driver";

/** A driver as the console lists them. */
export interface RosterDriver {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly active: boolean;
  readonly deactivatedAt: string | null;
  readonly onDuty: boolean;
  /** When `onDuty` last changed, by the server clock. Null if never On duty. */
  readonly onDutyChangedAt: string | null;
}

/** Who the dispatcher is provisioning. */
export interface DriverInvitation {
  readonly email: string;
  readonly name: string;
}

/** Every driver, active first then by name, with their On duty state. */
export async function fetchDrivers(client: CourierClient): Promise<RosterDriver[]> {
  const { data, error } = await client.rpc(DISPATCHER_DRIVERS);
  if (error) throw new ApiError(DISPATCHER_DRIVERS, error);

  return (data ?? []).map((row) => ({
    id: row.id,
    email: row.email,
    name: row.name,
    active: row.active,
    deactivatedAt: row.deactivated_at,
    onDuty: row.on_duty,
    onDutyChangedAt: row.on_duty_changed_at,
  }));
}

/**
 * Provisions a driver: Auth emails them an invite with a one-time code, which the
 * driver app turns into their first sign-in. Inviting is the Admin API, so it runs in
 * the `invite-driver` Edge Function, never in the browser.
 */
export async function inviteDriver(
  client: CourierClient,
  invitation: DriverInvitation,
): Promise<{ id: string }> {
  const { data, error } = await client.functions.invoke<{ id: string }>(INVITE_DRIVER, {
    body: invitation,
  });
  if (error) throw new ApiError(INVITE_DRIVER, { message: await reasonOf(error) });
  if (!data)
    throw new ApiError(INVITE_DRIVER, { message: "the server returned no driver" });

  return data;
}

/**
 * Deactivates a driver without deleting them: off duty, push token nulled, and unable
 * to sign in again.
 */
export async function deactivateDriver(
  client: CourierClient,
  driverId: string,
): Promise<void> {
  const { error } = await client.rpc(DEACTIVATE_DRIVER, { driver_id: driverId });
  if (error) throw new ApiError(DEACTIVATE_DRIVER, error);
}

/**
 * The function answers a refusal with `{ error }` in the body; supabase-js only says a
 * non-2xx came back, and leaves the response on `context`.
 */
async function reasonOf(error: { message: string; context?: unknown }): Promise<string> {
  if (error.context instanceof Response) {
    const body = await error.context.json().catch(() => null);
    if (typeof body?.error === "string") return body.error;
  }
  return error.message;
}
