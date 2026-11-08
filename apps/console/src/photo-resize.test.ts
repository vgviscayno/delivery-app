import { describe, expect, it } from "vitest";
import { scaledSize } from "./photo-resize.js";

const LARGE = { width: 1600, height: 3200 };

describe("the size a photo is stored at", () => {
  it("shrinks a wide photo to the width, keeping its shape", () => {
    expect(scaledSize({ width: 4032, height: 3024 }, LARGE)).toEqual({
      width: 1600,
      height: 1200,
    });
  });

  it("bounds a tall photo by its width too, as the shop shows them in columns", () => {
    expect(scaledSize({ width: 3024, height: 4032 }, LARGE)).toEqual({
      width: 1600,
      height: 2133,
    });
  });

  it("bounds a very tall photo by its height, so it stays small enough to store", () => {
    expect(scaledSize({ width: 1000, height: 8000 }, LARGE)).toEqual({
      width: 400,
      height: 3200,
    });
  });

  it("never enlarges a photo already small enough", () => {
    expect(scaledSize({ width: 800, height: 600 }, LARGE)).toEqual({
      width: 800,
      height: 600,
    });
  });

  it("keeps at least one pixel on a very thin photo", () => {
    expect(scaledSize({ width: 10000, height: 2 }, { width: 400, height: 800 })).toEqual({
      width: 400,
      height: 1,
    });
  });
});
