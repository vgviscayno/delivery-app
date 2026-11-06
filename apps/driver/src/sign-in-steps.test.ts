import { describe, expect, it } from "vitest";
import { stepShown } from "./sign-in-steps";

const jun = { email: "driver1@courier.local", name: "Jun Santos" };

describe("stepShown", () => {
  it("shows the names on this phone while there are any", () => {
    expect(stepShown({ kind: "pick" }, [jun])).toEqual({ kind: "pick" });
  });

  it("shows the email form for someone else, even with names on this phone", () => {
    expect(stepShown({ kind: "someone-else" }, [jun])).toEqual({ kind: "someone-else" });
  });

  it("shows the email form once the last name on this phone is removed", () => {
    expect(stepShown({ kind: "pick" }, [])).toEqual({ kind: "someone-else" });
  });
});
