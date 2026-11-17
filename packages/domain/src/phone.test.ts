import { describe, expect, it } from "vitest";
import { formatPhilippinePhone, parsePhilippinePhone } from "./phone.js";

describe("parsePhilippinePhone", () => {
  it.each([
    ["0917 123 4567", "+639171234567"],
    ["0917-123-4567", "+639171234567"],
    ["+63 917 123 4567", "+639171234567"],
    ["639171234567", "+639171234567"],
    ["917 123 4567", "+639171234567"],
    ["(02) 8123 4567", "+63281234567"],
    ["+639171234567", "+639171234567"],
  ])("reads %j as %s", (text, e164) => {
    expect(parsePhilippinePhone(text)).toBe(e164);
  });

  it.each([
    "",
    "12345",
    "0917 123",
    "0917 123 45678",
    "+0 917 123 4567",
    "+1 202 555 0123",
    "+63 123 456 7890",
    "call us",
  ])("refuses %j", (text) => {
    expect(parsePhilippinePhone(text)).toBeNull();
  });
});

describe("formatPhilippinePhone", () => {
  it.each([
    ["0917", "917"],
    ["09171234567", "917 123 4567"],
    ["917 123 4567", "917 123 4567"],
    ["+639171234567", "917 123 4567"],
    ["+63 917-123-4567", "917 123 4567"],
    ["0281234567", "2 8123 4567"],
    ["", ""],
  ])("shows %j after +63 as %j", (text, shown) => {
    expect(formatPhilippinePhone(text)).toBe(shown);
  });
});
