import { parsePhoneNumberFromString } from "libphonenumber-js/max";

export function parsePhilippinePhone(text: string): string | null {
  const number = parsePhoneNumberFromString(text, "PH");
  return number?.country === "PH" && number.isValid() ? number.number : null;
}

export function parsePhilippineMobile(text: string): string | null {
  const number = parsePhoneNumberFromString(text, "PH");
  return number?.country === "PH" && number.getType() === "MOBILE" ? number.number : null;
}

export const PHILIPPINE_PHONE_HINT = "Enter a Philippine number, such as 0917 123 4567.";

export const PHILIPPINE_MOBILE_HINT = "Enter your mobile number, such as 0917 123 4567.";
