// The full metadata: the default build checks only a number's length, not that its
// digits belong to a real Philippine range.
import { parsePhoneNumberFromString } from "libphonenumber-js/max";

/**
 * A Philippine number however it is written — `0917 123 4567`, `+63 917-123-4567`,
 * `917 123 4567`, `(02) 8123 4567` — into E.164, `+639171234567`, which is how the Shop
 * phone is stored. `null` when the text is not a real
 * Philippine mobile or landline number, blank included: whether blank is allowed is
 * the caller's call.
 */
export function parsePhilippinePhone(text: string): string | null {
  const number = parsePhoneNumberFromString(text, "PH");
  return number?.country === "PH" && number.isValid() ? number.number : null;
}

/**
 * A Philippine mobile, `0917 123 4567` or `+63 917-123-4567`, into E.164, as every
 * Account phone is stored. `null` for anything else, a landline included.
 */
export function parsePhilippineMobile(text: string): string | null {
  const number = parsePhoneNumberFromString(text, "PH");
  return number?.country === "PH" && number.getType() === "MOBILE" ? number.number : null;
}

/** What to tell someone whose number `parsePhilippinePhone` refused. */
export const PHILIPPINE_PHONE_HINT = "Enter a Philippine number, such as 0917 123 4567.";

/** What to tell someone whose number `parsePhilippineMobile` refused. */
export const PHILIPPINE_MOBILE_HINT = "Enter your mobile number, such as 0917 123 4567.";
