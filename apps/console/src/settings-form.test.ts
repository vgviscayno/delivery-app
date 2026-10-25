import type { ShopSettings } from "@courier/domain";
import { describe, expect, it } from "vitest";
import { formFromSettings, readSettingsForm } from "./settings-form.js";

const settings: ShopSettings = {
  sameDayCutoffBufferMinutes: 30,
  deliveryRadiusMeters: 5000,
  deliveryFeeCentavos: 5050,
  shopPhone: "+639170000000",
  qrPhImagePath: null,
  endOfDay: "16:00",
  darkThresholdMinutes: 10,
  timeConfirmationCutoff: null,
  orderingWindow: [],
  closures: [],
};

describe("the settings form", () => {
  it("shows the current settings in the units a dispatcher types", () => {
    expect(formFromSettings(settings)).toEqual({
      sameDayCutoffBufferMinutes: "30",
      deliveryRadiusKm: "5",
      deliveryFeePesos: "50.50",
      shopPhone: "+639170000000",
      endOfDay: "16:00",
      darkThresholdMinutes: "10",
      timeConfirmationCutoff: "",
    });
  });

  it("reads what was shown back unchanged", () => {
    expect(readSettingsForm(formFromSettings(settings))).toEqual({
      ok: true,
      edits: {
        sameDayCutoffBufferMinutes: 30,
        deliveryRadiusMeters: 5000,
        deliveryFeeCentavos: 5050,
        shopPhone: "+639170000000",
        endOfDay: "16:00",
        darkThresholdMinutes: 10,
        timeConfirmationCutoff: null,
      },
    });
  });

  it("turns a radius in kilometres into metres", () => {
    const form = { ...formFromSettings(settings), deliveryRadiusKm: "2.5" };
    expect(readSettingsForm(form)).toMatchObject({
      ok: true,
      edits: { deliveryRadiusMeters: 2500 },
    });
  });

  it("names every field that is wrong at once, not just the first", () => {
    const form = {
      ...formFromSettings(settings),
      deliveryFeePesos: "-1",
      shopPhone: "12345",
      sameDayCutoffBufferMinutes: "",
      deliveryRadiusKm: "0",
    };
    const result = readSettingsForm(form);

    expect(result.ok).toBe(false);
    expect(Object.keys(result.ok ? {} : result.errors).sort()).toEqual([
      "deliveryFeePesos",
      "deliveryRadiusKm",
      "sameDayCutoffBufferMinutes",
      "shopPhone",
    ]);
  });
});

describe("the Delivery fee field", () => {
  const withFee = (deliveryFeePesos: string) =>
    readSettingsForm({ ...formFromSettings(settings), deliveryFeePesos });

  it.each([
    ["50", 5000],
    ["50.5", 5050],
    ["50.50", 5050],
    ["0", 0],
    ["₱1,250.00", 125000],
    [" 75 ", 7500],
    ["0.29", 29],
  ])("reads %j pesos as %i centavos", (text, centavos) => {
    expect(withFee(text)).toMatchObject({
      ok: true,
      edits: { deliveryFeeCentavos: centavos },
    });
  });

  it("reads an empty field as not agreed yet", () => {
    expect(withFee("")).toMatchObject({ ok: true, edits: { deliveryFeeCentavos: null } });
  });

  it.each(["50.555", "-5", "fifty", "1.2.3"])("refuses %j", (text) => {
    expect(withFee(text)).toMatchObject({
      ok: false,
      errors: { deliveryFeePesos: expect.any(String) },
    });
  });
});

describe("the Shop phone field", () => {
  const withPhone = (shopPhone: string) =>
    readSettingsForm({ ...formFromSettings(settings), shopPhone });

  it.each([
    ["0917 123 4567", "+639171234567"],
    ["0917-123-4567", "+639171234567"],
    ["+63 917 123 4567", "+639171234567"],
    ["639171234567", "+639171234567"],
    ["(02) 8123 4567", "+63281234567"],
  ])("reads %j as %s", (text, e164) => {
    expect(withPhone(text)).toMatchObject({ ok: true, edits: { shopPhone: e164 } });
  });

  it("reads an empty field as not agreed yet", () => {
    expect(withPhone("  ")).toMatchObject({ ok: true, edits: { shopPhone: null } });
  });

  it.each(["12345", "0917 123", "+0 917 123 4567", "call us"])("refuses %j", (text) => {
    expect(withPhone(text)).toMatchObject({
      ok: false,
      errors: { shopPhone: expect.any(String) },
    });
  });
});
