import { describe, expect, it } from "vitest";
import { BackendEnvError, readBackendEnv } from "./index.js";

describe("readBackendEnv", () => {
  it("reads a configured backend", () => {
    expect(
      readBackendEnv({
        VITE_SUPABASE_URL: "http://127.0.0.1:54321",
        VITE_SUPABASE_ANON_KEY: "anon-key",
      }),
    ).toEqual({
      supabaseUrl: "http://127.0.0.1:54321",
      supabaseAnonKey: "anon-key",
    });
  });

  it("names every missing variable at once, rather than one per run", () => {
    let message = "";
    try {
      readBackendEnv({});
    } catch (error) {
      expect(error).toBeInstanceOf(BackendEnvError);
      message = (error as Error).message;
    }

    expect(message).toContain("VITE_SUPABASE_URL");
    expect(message).toContain("VITE_SUPABASE_ANON_KEY");
  });

  it("rejects a URL that is not one", () => {
    expect(() =>
      readBackendEnv({
        VITE_SUPABASE_URL: "127.0.0.1:54321",
        VITE_SUPABASE_ANON_KEY: "anon-key",
      }),
    ).toThrow(/VITE_SUPABASE_URL/);
  });
});
