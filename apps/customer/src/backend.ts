import { type BackendEnv, readBackendEnv } from "@courier/config";

export interface AppBackend {
  readonly backend: BackendEnv;
  readonly mapboxToken: string | undefined;
}

export function readAppBackend(): AppBackend {
  return {
    backend: readBackendEnv(
      {
        EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
        EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      },
      "EXPO_PUBLIC_",
    ),
    mapboxToken: process.env.EXPO_PUBLIC_MAPBOX_TOKEN || undefined,
  };
}
