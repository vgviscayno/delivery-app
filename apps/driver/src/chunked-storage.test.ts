import { describe, expect, it } from "vitest";
import { createChunkedStorage, type KeyValueStore } from "./chunked-storage";

/** SecureStore's shape, in memory, refusing any value over its 2048-byte limit. */
function memoryStore(): KeyValueStore & { keys(): string[] } {
  const values = new Map<string, string>();
  return {
    async getItemAsync(key) {
      return values.get(key) ?? null;
    },
    async setItemAsync(key, value) {
      if (!/^[\w.-]+$/.test(key)) throw new Error(`invalid key ${key}`);
      if (new TextEncoder().encode(value).length > 2048) {
        throw new Error(`value for ${key} is over 2048 bytes`);
      }
      values.set(key, value);
    },
    async deleteItemAsync(key) {
      values.delete(key);
    },
    keys: () => [...values.keys()].sort(),
  };
}

/** About the size of a real supabase-js session: two JWTs and a user. */
const session = JSON.stringify({
  access_token: "a".repeat(1200),
  refresh_token: "r".repeat(40),
  user: {
    id: "d1500000-0000-4000-8000-000000000101",
    app_metadata: { name: "Niño Ñañez 🚚" },
  },
  padding: "x".repeat(2500),
});

describe("createChunkedStorage", () => {
  it("round-trips a session far larger than one SecureStore value", async () => {
    const storage = createChunkedStorage(memoryStore());

    await storage.setItem("sb-127-auth-token", session);

    await expect(storage.getItem("sb-127-auth-token")).resolves.toBe(session);
  });

  it("keeps multi-byte names whole across chunk boundaries", async () => {
    const storage = createChunkedStorage(memoryStore());
    const names = "Niño 🚚 ".repeat(800);

    await storage.setItem("names", names);

    await expect(storage.getItem("names")).resolves.toBe(names);
  });

  it("is empty for a key never written", async () => {
    await expect(
      createChunkedStorage(memoryStore()).getItem("nothing"),
    ).resolves.toBeNull();
  });

  it("leaves no stale chunks behind when a shorter value replaces a longer one", async () => {
    const store = memoryStore();
    const storage = createChunkedStorage(store);

    await storage.setItem("token", session);
    await storage.setItem("token", "short");

    await expect(storage.getItem("token")).resolves.toBe("short");
    expect(store.keys()).toEqual(["token", "token.0"]);
  });

  it("removes every chunk", async () => {
    const store = memoryStore();
    const storage = createChunkedStorage(store);

    await storage.setItem("token", session);
    await storage.removeItem("token");

    await expect(storage.getItem("token")).resolves.toBeNull();
    expect(store.keys()).toEqual([]);
  });

  it("reads a value with a missing chunk as no value, never as a truncated one", async () => {
    const store = memoryStore();
    const storage = createChunkedStorage(store);

    await storage.setItem("token", session);
    await store.deleteItemAsync("token.1");

    await expect(storage.getItem("token")).resolves.toBeNull();
  });

  it("stores keys SecureStore would refuse under a name it accepts", async () => {
    const storage = createChunkedStorage(memoryStore());

    await storage.setItem("sb:auth/token", "value");

    await expect(storage.getItem("sb:auth/token")).resolves.toBe("value");
  });
});
