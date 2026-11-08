import { describe, expect, it } from "vitest";
import { hasSeenTour, markTourSeen } from "./tours.js";

/** A browser's storage, held in a map. */
function memoryStorage(): () => Storage {
  const items = new Map<string, string>();
  const storage = {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  } as Storage;
  return () => storage;
}

/** Site data blocked: even reaching the storage throws. */
const blocked = (): Storage => {
  throw new DOMException("The operation is insecure.", "SecurityError");
};

describe("whether a tour has been seen", () => {
  it("is remembered per sub-tab", () => {
    const storage = memoryStorage();
    markTourSeen("products", storage);
    expect(hasSeenTour("products", storage)).toBe(true);
    expect(hasSeenTour("categories", storage)).toBe(false);
  });

  it("counts as not seen, without failing, when storage is blocked", () => {
    expect(() => markTourSeen("products", blocked)).not.toThrow();
    expect(hasSeenTour("products", blocked)).toBe(false);
  });
});
