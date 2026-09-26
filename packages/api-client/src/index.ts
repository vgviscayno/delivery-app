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

/** Reads the shop clock. The one call the walking skeleton makes end to end. */
export async function fetchServerClock(client: CourierClient): Promise<ServerClock> {
  const { data, error } = await client.rpc("server_clock");

  if (error) throw new ApiError("server_clock", error);

  const row = data?.[0];
  if (!row)
    throw new ApiError("server_clock", { message: "the server returned no clock" });

  return toServerClock(row);
}
