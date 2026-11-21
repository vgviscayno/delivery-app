import type { BackendEnv } from "@courier/config";
import type { Database } from "@courier/domain";
import {
  createClient,
  type SupabaseClient,
  type SupportedStorage,
} from "@supabase/supabase-js";

export type CourierClient = SupabaseClient<Database>;

export interface CourierClientOptions {
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
      detectSessionInUrl: false,
    },
  });
}

export const NETWORK_FAILURE = "network_failure";

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

function isNetworkFailure(cause: { message: string; name?: string | undefined }) {
  return (
    cause.name === "AuthRetryableFetchError" ||
    /network request failed|fetch failed/i.test(cause.message)
  );
}
