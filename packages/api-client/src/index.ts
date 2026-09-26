import type { BackendEnv } from "@courier/config";
import type { Database, ServerClock } from "@courier/domain";
import { toServerClock } from "@courier/domain";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The typed Supabase client every TypeScript surface talks through.
 *
 * The named server surface is narrow on purpose: RPCs, views, Broadcast channels,
 * Storage and Auth. Nothing here reaches a table directly.
 */
export type CourierClient = SupabaseClient<Database>;

export function createCourierClient(env: BackendEnv): CourierClient {
  return createClient<Database>(env.supabaseUrl, env.supabaseAnonKey);
}

export class ApiError extends Error {
  constructor(
    readonly operation: string,
    cause: { message: string; code?: string },
  ) {
    super(`${operation} failed: ${cause.message}`);
    this.name = "ApiError";
  }
}

const SERVER_CLOCK = "server_clock";

/** Reads the shop clock. The one call the walking skeleton makes end to end. */
export async function fetchServerClock(client: CourierClient): Promise<ServerClock> {
  const { data, error } = await client.rpc(SERVER_CLOCK);

  if (error) throw new ApiError(SERVER_CLOCK, error);

  const row = data?.[0];
  if (!row) throw new ApiError(SERVER_CLOCK, { message: "the server returned no clock" });

  return toServerClock(row);
}
