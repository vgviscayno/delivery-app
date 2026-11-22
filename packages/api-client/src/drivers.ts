import { ApiError, type CourierClient } from "./client.js";

const DISPATCHER_DRIVERS = "dispatcher_drivers";
const DEACTIVATE_DRIVER = "deactivate_driver";
const INVITE_DRIVER = "invite-driver";

export interface DispatcherDriver {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly active: boolean;
  readonly deactivatedAt: string | null;
  readonly onDuty: boolean;
  readonly onDutyChangedAt: string | null;
}

export interface DriverInvitation {
  readonly email: string;
  readonly name: string;
}

export async function fetchDrivers(client: CourierClient): Promise<DispatcherDriver[]> {
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

export async function deactivateDriver(
  client: CourierClient,
  driverId: string,
): Promise<void> {
  const { error } = await client.rpc(DEACTIVATE_DRIVER, { driver_id: driverId });
  if (error) throw new ApiError(DEACTIVATE_DRIVER, error);
}

async function reasonOf(error: { message: string; context?: unknown }): Promise<string> {
  if (error.context instanceof Response) {
    const body = await error.context.json().catch(() => null);
    if (typeof body?.error === "string") return body.error;
  }
  return error.message;
}
