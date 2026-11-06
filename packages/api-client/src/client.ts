import type { BackendEnv } from "@courier/config";
import type { Database } from "@courier/domain";
import {
  createClient,
  type SupabaseClient,
  type SupportedStorage,
} from "@supabase/supabase-js";

/**
 * The typed Supabase client every TypeScript surface talks through.
 *
 * The named server surface is narrow on purpose: RPCs, views, Broadcast channels,
 * Storage and Auth. Nothing here reaches a table directly.
 */
export type CourierClient = SupabaseClient<Database>;

export interface CourierClientOptions {
  /**
   * Where the session is kept. The browser's localStorage when omitted; a phone passes
   * encrypted storage, since the session holds a long-lived refresh token.
   */
  readonly sessionStorage?: SupportedStorage;
}

export function createCourierClient(
  env: BackendEnv,
  { sessionStorage }: CourierClientOptions = {},
): CourierClient {
  if (!sessionStorage)
    return createClient<Database>(env.supabaseUrl, env.supabaseAnonKey);

  return createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      storage: sessionStorage,
      persistSession: true,
      autoRefreshToken: true,
      // A native app has no URL for a session to arrive in.
      detectSessionInUrl: false,
    },
  });
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
