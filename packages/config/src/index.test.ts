import { describe, expect, it } from "vitest";
import { BackendEnvError, readBackendEnv } from "./index.js";

describe("readBackendEnv", () => {
  it("reads a configured backend", () => {
    expect(
      readBackendEnv(
        {
          VITE_SUPABASE_URL: "http://127.0.0.1:54321",
          VITE_SUPABASE_ANON_KEY: "anon-key",
        },
        "VITE_",
      ),
    ).toEqual({
      supabaseUrl: "http://127.0.0.1:54321",
      supabaseAnonKey: "anon-key",
    });
  });

  it("names every missing variable at once, rather than one per run", () => {
    let message = "";
    try {
      readBackendEnv({}, "VITE_");
    } catch (error) {
      expect(error).toBeInstanceOf(BackendEnvError);
      message = (error as Error).message;
    }

    expect(message).toContain("VITE_SUPABASE_URL");
    expect(message).toContain("VITE_SUPABASE_ANON_KEY");
  });

  it("rejects a URL that is not one", () => {
    expect(() =>
      readBackendEnv(
        {
          VITE_SUPABASE_URL: "127.0.0.1:54321",
          VITE_SUPABASE_ANON_KEY: "anon-key",
        },
        "VITE_",
      ),
    ).toThrow(/VITE_SUPABASE_URL/);
  });

  it("reads the mobile apps' variables under the prefix Expo inlines", () => {
    expect(
      readBackendEnv(
        {
          EXPO_PUBLIC_SUPABASE_URL: "http://10.0.2.2:54321",
          EXPO_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
          VITE_SUPABASE_URL: "http://127.0.0.1:54321",
        },
        "EXPO_PUBLIC_",
      ),
    ).toEqual({
      supabaseUrl: "http://10.0.2.2:54321",
      supabaseAnonKey: "anon-key",
    });
  });

  it("names a missing variable with the prefix the caller used", () => {
    expect(() => readBackendEnv({}, "EXPO_PUBLIC_")).toThrow(
      /EXPO_PUBLIC_SUPABASE_URL[\s\S]*EXPO_PUBLIC_SUPABASE_ANON_KEY/,
    );
    expect(() => readBackendEnv({}, "EXPO_PUBLIC_")).not.toThrow(/VITE_/);
  });
});
