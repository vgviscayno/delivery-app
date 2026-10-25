import { describe, expect, it } from "vitest";
import { MAP_STYLE } from "./index.js";

describe("MAP_STYLE", () => {
  it("is a style-spec document, so it can move to MapLibre without a rewrite", () => {
    expect(MAP_STYLE.version).toBe(8);
    expect(MAP_STYLE.layers.length).toBeGreaterThan(0);
  });

  it("carries no access token; the apps supply theirs at runtime", () => {
    const text = JSON.stringify(MAP_STYLE);

    expect(text).not.toMatch(/access_token/);
    expect(text).not.toMatch(/\bpk\.[\w-]+/);
    expect(text).not.toMatch(/\bsk\.[\w-]+/);
  });

  it("survives a JSON round trip, which is how it reaches the native map", () => {
    expect(JSON.parse(JSON.stringify(MAP_STYLE))).toEqual(MAP_STYLE);
  });
});
