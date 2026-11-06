import { describe, expect, it } from "vitest";
import {
  forgetDriver,
  parseRememberedDrivers,
  rememberDriver,
} from "./remembered-drivers";

const jun = { email: "driver1@courier.local", name: "Jun Santos" };
const mara = { email: "driver2@courier.local", name: "Mara Dizon" };

describe("rememberDriver", () => {
  it("puts whoever signed in last at the top", () => {
    expect(rememberDriver([jun], mara)).toEqual([mara, jun]);
  });

  it("lists each driver once, by email, under the name the server last gave", () => {
    const renamed = { email: "DRIVER1@courier.local", name: "Jun S." };

    expect(rememberDriver([mara, jun], renamed)).toEqual([
      { email: "driver1@courier.local", name: "Jun S." },
      mara,
    ]);
  });

  it("forgets the longest-unused names once the phone has seen many drivers", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      email: `d${i}@courier.local`,
      name: `Driver ${i}`,
    }));

    const remembered = rememberDriver(many, jun);

    expect(remembered).toHaveLength(8);
    expect(remembered[0]).toEqual(jun);
    expect(remembered.at(-1)).toEqual({ email: "d6@courier.local", name: "Driver 6" });
  });
});

describe("forgetDriver", () => {
  it("takes one name off this phone", () => {
    expect(forgetDriver([mara, jun], "DRIVER2@courier.local")).toEqual([jun]);
  });
});

describe("parseRememberedDrivers", () => {
  it("reads what rememberDriver stored", () => {
    expect(parseRememberedDrivers(JSON.stringify([mara, jun]))).toEqual([mara, jun]);
  });

  it("starts empty on a phone nobody has signed in on, or whose list is unreadable", () => {
    expect(parseRememberedDrivers(null)).toEqual([]);
    expect(parseRememberedDrivers("{not json")).toEqual([]);
    expect(parseRememberedDrivers(JSON.stringify([{ email: 3 }, mara]))).toEqual([mara]);
  });
});
