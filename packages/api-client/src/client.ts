import type { BackendEnv } from "@courier/config";
import type { Database } from "@courier/domain";
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
    cause: { message: string; code?: string | undefined },
  ) {
    super(`${operation} failed: ${cause.message}`);
    this.name = "ApiError";
  }
}
