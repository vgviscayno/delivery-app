import {
  ApiError,
  EMAIL_CONFIRMATION_REQUIRED,
  INVALID_ACCOUNT_PHONE,
  INVALID_EMAIL,
  NETWORK_FAILURE,
} from "@courier/api-client";
import { PHILIPPINE_MOBILE_HINT } from "@courier/domain";

const TOO_MANY_TRIES = "Too many tries. Wait a minute, then try again.";
export const INVALID_EMAIL_HINT = "Enter a valid email address, such as lia@example.com.";
const EMAIL_IN_USE = "An Account already uses this email. Sign in instead.";

const WORDS: Readonly<Record<string, string>> = {
  user_already_exists: EMAIL_IN_USE,
  email_exists: EMAIL_IN_USE,
  invalid_credentials: "That email and password don't match.",
  over_request_rate_limit: TOO_MANY_TRIES,
  over_email_send_rate_limit: TOO_MANY_TRIES,
  [EMAIL_CONFIRMATION_REQUIRED]: "Confirm your email, then sign in.",
  [INVALID_EMAIL]: INVALID_EMAIL_HINT,
  [INVALID_ACCOUNT_PHONE]: PHILIPPINE_MOBILE_HINT,
  [NETWORK_FAILURE]: "Can't reach Courier. Check your connection and try again.",
};

export function customerMessage(error: unknown): string {
  const known = error instanceof ApiError && error.code ? WORDS[error.code] : undefined;
  if (known) return known;
  console.warn(error);
  return "Something went wrong. Try again.";
}

export function looksLikeEmail(text: string): boolean {
  return /^[^\s@]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(text);
}
