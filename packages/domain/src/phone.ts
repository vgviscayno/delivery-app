/**
 * A Philippine number however it is written — `0917 123 4567`, `+63 917-123-4567`,
 * `(02) 8123 4567` — into E.164, `+639171234567`, which is how the Shop phone and every
 * Account phone are stored. `null` when the text is not a Philippine number, blank
 * included: whether blank is allowed is the caller's call.
 */
export function parsePhilippinePhone(text: string): string | null {
  const cleaned = text.replace(/[\s\-().]/g, "");
  const national = /^(?:\+63|63|0)(\d+)$/.exec(cleaned)?.[1];

  // A mobile number has 10 digits after the country code, a landline 9.
  if (!national || national.length < 9 || national.length > 10 || national[0] === "0") {
    return null;
  }
  return `+63${national}`;
}

/** What to tell someone whose number `parsePhilippinePhone` refused. */
export const PHILIPPINE_PHONE_EXAMPLE =
  "Enter a Philippine number, such as 0917 123 4567 or (02) 8123 4567.";
