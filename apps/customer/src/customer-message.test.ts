import { ApiError } from "@courier/api-client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { customerMessage, looksLikeEmail } from "./customer-message";

const failed = (code: string) => new ApiError("sign_up", { message: "raw", code });

describe("customerMessage", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ["user_already_exists", "An Account already uses this email. Sign in instead."],
    ["email_exists", "An Account already uses this email. Sign in instead."],
    ["invalid_credentials", "That email and password don't match."],
    ["over_request_rate_limit", "Too many tries. Wait a minute, then try again."],
    ["over_email_send_rate_limit", "Too many tries. Wait a minute, then try again."],
    ["email_confirmation_required", "Confirm your email, then sign in."],
    ["invalid_email", "Enter a valid email address, such as lia@example.com."],
    ["invalid_account_phone", "Enter your mobile number, such as 0917 123 4567."],
  ])("words %s for the customer", (code, words) => {
    expect(customerMessage(failed(code))).toBe(words);
  });

  it("says the server could not be reached", () => {
    const offline = new ApiError("sign_in", {
      name: "AuthRetryableFetchError",
      message: "Network request failed",
    });
    expect(customerMessage(offline)).toBe(
      "Can't reach Courier. Check your connection and try again.",
    );
  });

  it.each([
    ["an unknown code", failed("validation_failed")],
    ["something that is not an ApiError", new TypeError("x is undefined")],
  ])("says something went wrong for %s, and logs the detail", (_, error) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(customerMessage(error)).toBe("Something went wrong. Try again.");
    expect(warn).toHaveBeenCalledWith(error);
  });
});

describe("looksLikeEmail", () => {
  it.each(["lia@example.com", "lia.santos+orders@mail.co.ph"])("accepts %j", (text) => {
    expect(looksLikeEmail(text)).toBe(true);
  });

  it.each([
    "lia",
    "lia@",
    "@mail.com",
    "lia @mail.com",
    "lia@mail",
    "lia@mail..com",
    "lia@@mail.com",
    "lia@a,`sd.com",
    "lia@mail.c_m",
  ])("refuses %j", (text) => {
    expect(looksLikeEmail(text)).toBe(false);
  });
});
