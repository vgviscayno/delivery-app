import { z } from "zod";

/**
 * The shop's only time zone. Server-side rules are judged by `app.now()`; this
 * constant is here so a client can name the zone it is rendering, never so it can
 * work out the current delivery day for itself.
 */
export const TIME_ZONE = "Asia/Manila";

const backendEnvSchema = z.object({
  supabaseUrl: z.url("must be the Supabase project URL, e.g. http://127.0.0.1:54321"),
  supabaseAnonKey: z.string().min(1, "must be the project's anon key"),
});

/** Which Supabase a surface talks to. Local, a PR's preview branch, or production. */
export type BackendEnv = z.infer<typeof backendEnvSchema>;

/**
 * The prefix a bundler inlines into client code. Vite inlines `VITE_*` for the console;
 * Expo inlines only `EXPO_PUBLIC_*` for the mobile apps. The rest of each name is shared.
 */
export type BackendEnvPrefix = "VITE_" | "EXPO_PUBLIC_";

const VARIABLE_SUFFIXES = {
  supabaseUrl: "SUPABASE_URL",
  supabaseAnonKey: "SUPABASE_ANON_KEY",
} as const;

export class BackendEnvError extends Error {
  constructor(problems: readonly string[]) {
    super(
      [
        "The backend environment is not configured.",
        ...problems.map((problem) => `  - ${problem}`),
        "Copy .env.example to .env.local and fill it in, or run `pnpm db:start` and use the",
        "values the Supabase CLI prints.",
      ].join("\n"),
    );
    this.name = "BackendEnvError";
  }
}

/**
 * Reads the backend environment out of a bag of variables — `import.meta.env` in the
 * console, the inlined `process.env.EXPO_PUBLIC_*` values in a mobile app — and fails loudly rather than letting a surface
 * boot pointed at nothing. Errors name each variable with the caller's `prefix`, so
 * they point at the file the caller actually reads.
 */
export function readBackendEnv(
  source: Record<string, string | undefined>,
  prefix: BackendEnvPrefix,
): BackendEnv {
  const nameOf = (key: keyof typeof VARIABLE_SUFFIXES) =>
    `${prefix}${VARIABLE_SUFFIXES[key]}`;

  const result = backendEnvSchema.safeParse({
    supabaseUrl: source[nameOf("supabaseUrl")],
    supabaseAnonKey: source[nameOf("supabaseAnonKey")],
  });

  if (result.success) return result.data;

  throw new BackendEnvError(
    result.error.issues.map((issue) => {
      const key = issue.path[0] as keyof typeof VARIABLE_SUFFIXES;
      return `${nameOf(key)}: ${issue.message}`;
    }),
  );
}

export {
  MAP_STYLE,
  type MapStyle,
  type MapStyleLayer,
  type MapStyleValue,
} from "./map-style.js";
export { type LatLng, SHOP_PIN } from "./shop-pin.js";
