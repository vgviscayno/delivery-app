import { afterEach, describe, expect, it, vi } from "vitest";
import { readAppBackend } from "./backend";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("readAppBackend", () => {
  it("reads Supabase and the Mapbox token from the EXPO_PUBLIC_ variables", () => {
    vi.stubEnv("EXPO_PUBLIC_SUPABASE_URL", "http://10.0.2.2:54321");
    vi.stubEnv("EXPO_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    vi.stubEnv("EXPO_PUBLIC_MAPBOX_TOKEN", "map-token");

    expect(readAppBackend()).toEqual({
      backend: { supabaseUrl: "http://10.0.2.2:54321", supabaseAnonKey: "anon-key" },
      mapboxToken: "map-token",
    });
  });

  it("names the Expo variable when Supabase is not configured", () => {
    vi.stubEnv("EXPO_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("EXPO_PUBLIC_SUPABASE_ANON_KEY", "");

    expect(() => readAppBackend()).toThrow(/EXPO_PUBLIC_SUPABASE_URL/);
  });
});
