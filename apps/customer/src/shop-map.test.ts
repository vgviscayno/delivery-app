import { describe, expect, it } from "vitest";
import { toMapCoordinate } from "./shop-map";

describe("toMapCoordinate", () => {
  it("puts longitude first, the order Mapbox reads, not the order people say", () => {
    expect(toMapCoordinate({ latitude: 14.6, longitude: 121.05 })).toEqual([
      121.05, 14.6,
    ]);
  });
});
