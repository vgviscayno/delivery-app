import { describe, expect, it } from "vitest";
import {
  estimatedPeso,
  formatPeso,
  formatWeight,
  lineTotalCentavos,
  shelfPrice,
  stepWeight,
  weightChips,
} from "./pricing.js";

describe("lineTotalCentavos", () => {
  it("prices a weight at the rate per kilogram", () => {
    // ₱1,150/kg × 500 g = ₱575.
    expect(lineTotalCentavos(115000, 500)).toBe(57500);
  });

  it("rounds to the nearest centavo once, at the end", () => {
    // ₱12.34/kg × 250 g = 308.5 centavos → 309, as Postgres rounds numeric halves.
    expect(lineTotalCentavos(1234, 250)).toBe(309);
    // ₱12.33/kg × 250 g = 308.25 centavos → 308.
    expect(lineTotalCentavos(1233, 250)).toBe(308);
  });

  it("does not round a per-gram rate first", () => {
    // ₱999.99/kg is 99.999 centavos a gram: rounding that to 100 first would make
    // 3 kg ₱3,000.00, not ₱2,999.97.
    expect(lineTotalCentavos(99999, 3000)).toBe(299997);
  });
});

describe("weightChips", () => {
  it("offers the step, twice the step, then whole kilograms up to 2 kg", () => {
    expect(weightChips(250)).toEqual([250, 500, 1000, 2000]);
  });

  it("does not repeat a weight that is both a multiple of the step and a whole kg", () => {
    expect(weightChips(500)).toEqual([500, 1000, 2000]);
    expect(weightChips(1000)).toEqual([1000, 2000]);
  });

  it("leaves out whole kilograms the step cannot reach", () => {
    expect(weightChips(300)).toEqual([300, 600]);
  });

  it("still offers the step and twice it when the step is above 2 kg", () => {
    expect(weightChips(1500)).toEqual([1500, 3000]);
  });
});

describe("stepWeight", () => {
  it("moves a weight one step up or down", () => {
    expect(stepWeight(500, 250, 1)).toBe(750);
    expect(stepWeight(750, 250, -1)).toBe(500);
  });

  it("goes no lower than one step", () => {
    expect(stepWeight(250, 250, -1)).toBe(250);
  });

  it("snaps a weight that is not a multiple of the step onto one", () => {
    // A 1 kg chip picked before the dispatcher changed the step to 300 g.
    expect(stepWeight(1000, 300, 1)).toBe(1200);
    expect(stepWeight(1000, 300, -1)).toBe(900);
  });
});

describe("formatPeso", () => {
  it("shows whole pesos without centavos, grouped by thousands", () => {
    expect(formatPeso(115000)).toBe("₱1,150");
    expect(formatPeso(123456700)).toBe("₱1,234,567");
  });

  it("shows centavos to two places when there are any", () => {
    expect(formatPeso(57550)).toBe("₱575.50");
    expect(formatPeso(5)).toBe("₱0.05");
  });
});

describe("estimatedPeso", () => {
  it("marks an estimate with ~", () => {
    expect(estimatedPeso(57500)).toBe("~₱575");
  });
});

describe("formatWeight", () => {
  it("shows grams under a kilogram and kilograms from one up", () => {
    expect(formatWeight(250)).toBe("250 g");
    expect(formatWeight(1000)).toBe("1 kg");
    expect(formatWeight(1500)).toBe("1.5 kg");
    expect(formatWeight(1250)).toBe("1.25 kg");
  });
});

describe("shelfPrice", () => {
  it("shows a per-unit price flat", () => {
    expect(shelfPrice({ type: "per_unit", unitPriceCentavos: 18500 })).toBe("₱185");
  });

  it("shows a per-weight price as a rate, which is not an estimate", () => {
    expect(
      shelfPrice({
        type: "per_weight",
        pricePerKgCentavos: 115000,
        weightStepGrams: 250,
        toleranceGrams: 50,
      }),
    ).toBe("₱1,150/kg");
  });
});
