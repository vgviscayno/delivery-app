import { describe, expect, it } from "vitest";
import { editMobileField, mobileFieldOf, typedMobile } from "./mobile-field";

describe("editMobileField", () => {
  it.each([
    ["", "1", "1"],
    ["17", "171", "17 1"],
    ["17 123 456", "17 123 4567", "17 123 4567"],
  ])("groups typing after 09: %j then %j shows %j", (previous, text, shown) => {
    expect(editMobileField(previous, text)).toBe(shown);
  });

  it("stops at the 9 digits after 09", () => {
    expect(editMobileField("17 123 4567", "17 123 45678")).toBe("17 123 4567");
  });

  it("keeps a number whose digits after 09 start 09 or 63 when typed one at a time", () => {
    expect(editMobileField("09 123 456", "09 123 4567")).toBe("09 123 4567");
    expect(editMobileField("63", "639")).toBe("63 9");
  });

  it.each(["0917 123 4567", "+63 917 123 4567", "639171234567", "09171234567"])(
    "cuts a pasted or autofilled %j down to the digits after 09",
    (pasted) => {
      expect(editMobileField("", pasted)).toBe("17 123 4567");
    },
  );

  it("takes the digit before a space when backspacing over it", () => {
    expect(editMobileField("17 123", "17123")).toBe("11 23");
  });

  it("removes a digit at the end as usual", () => {
    expect(editMobileField("17 123", "17 12")).toBe("17 12");
  });
});

describe("mobileFieldOf", () => {
  it("shows a stored Account phone after 09", () => {
    expect(mobileFieldOf("+639171234567")).toBe("17 123 4567");
  });
});

describe("typedMobile", () => {
  it("puts the 09 back for checking", () => {
    expect(typedMobile("17 123 4567")).toBe("0917 123 4567");
  });
});
