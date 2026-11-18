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

/** `ApiError.code` when the request never reached the server, or got no answer. */
export const NETWORK_FAILURE = "network_failure";

/**
 * A call that failed. `message` is for logs; `code` is what an app reads to decide what
 * to tell someone: the server's own (`user_already_exists`, `invalid_credentials`, …),
 * `NETWORK_FAILURE`, or one this package gives its own refusals.
 */
export class ApiError extends Error {
  readonly code: string | undefined;

  constructor(
    readonly operation: string,
    cause: { message: string; code?: string | undefined; name?: string | undefined },
  ) {
    super(`${operation} failed: ${cause.message}`);
    this.name = "ApiError";
    this.code = isNetworkFailure(cause) ? NETWORK_FAILURE : cause.code || undefined;
  }
}

// auth-js names the error it throws when fetch fails; postgrest-js passes on fetch's own
// message instead, which React Native words "Network request failed" and Node "fetch
// failed".
function isNetworkFailure(cause: { message: string; name?: string | undefined }) {
  return (
    cause.name === "AuthRetryableFetchError" ||
    /network request failed|fetch failed/i.test(cause.message)
  );
}
