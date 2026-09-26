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

const VARIABLE_NAMES = {
  supabaseUrl: "VITE_SUPABASE_URL",
  supabaseAnonKey: "VITE_SUPABASE_ANON_KEY",
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
 * console, `process.env` in a script — and fails loudly rather than letting a surface
 * boot pointed at nothing.
 */
export function readBackendEnv(source: Record<string, string | undefined>): BackendEnv {
  const result = backendEnvSchema.safeParse({
    supabaseUrl: source[VARIABLE_NAMES.supabaseUrl],
    supabaseAnonKey: source[VARIABLE_NAMES.supabaseAnonKey],
  });

  if (result.success) return result.data;

  throw new BackendEnvError(
    result.error.issues.map((issue) => {
      const key = issue.path[0] as keyof typeof VARIABLE_NAMES;
      return `${VARIABLE_NAMES[key]}: ${issue.message}`;
    }),
  );
}
