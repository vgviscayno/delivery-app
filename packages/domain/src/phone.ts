// The full metadata: the default build checks only a number's length, not that its
// digits belong to a real Philippine range.
import { AsYouType, parsePhoneNumberFromString } from "libphonenumber-js/max";

/**
 * A Philippine number however it is written — `0917 123 4567`, `+63 917-123-4567`,
 * `917 123 4567`, `(02) 8123 4567` — into E.164, `+639171234567`, which is how the Shop
 * phone and every Account phone are stored. `null` when the text is not a real
 * Philippine mobile or landline number, blank included: whether blank is allowed is
 * the caller's call.
 */
export function parsePhilippinePhone(text: string): string | null {
  const number = parsePhoneNumberFromString(text, "PH");
  return number?.country === "PH" && number.isValid() ? number.number : null;
}

/**
 * The number as a customer sees it after a fixed `+63`, grouped as they type:
 * `09171234567` and `+639171234567` both show as `917 123 4567`. A typed trunk `0` or a
 * pasted `+63` is dropped, since the `+63` is already on screen.
 */
export function formatPhilippinePhone(text: string): string {
  const digits = text.replace(/\D/g, "");
  const national =
    text.trim().startsWith("+") || (digits.startsWith("63") && digits.length > 10)
      ? digits.replace(/^63/, "")
      : digits.replace(/^0/, "");
  if (national === "") return "";
  return new AsYouType().input(`+63${national}`).replace(/^\+63\s*/, "");
}

/** What to tell someone whose number `parsePhilippinePhone` refused. */
export const PHILIPPINE_PHONE_HINT = "Enter a Philippine number, such as 0917 123 4567.";
