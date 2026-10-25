import { type BackendEnv, readBackendEnv } from "@courier/config";

export interface AppBackend {
  readonly backend: BackendEnv;
  /** Mapbox public token, or undefined when the map is not configured. */
  readonly mapboxToken: string | undefined;
}

/**
 * Reads what the app talks to. Each variable is named in full on purpose: Expo inlines
 * `process.env.EXPO_PUBLIC_*` only where it is written out like this, so passing
 * `process.env` itself to `readBackendEnv` would hand it an empty bag in a real build.
 */
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
