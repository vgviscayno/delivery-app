import {
  ApiError,
  EMAIL_CONFIRMATION_REQUIRED,
  INVALID_ACCOUNT_PHONE,
  NETWORK_FAILURE,
} from "@courier/api-client";
import { PHILIPPINE_MOBILE_HINT } from "@courier/domain";

const TOO_MANY_TRIES = "Too many tries. Wait a minute, then try again.";
const EMAIL_IN_USE = "An Account already uses this email. Sign in instead.";

/** What the customer reads for a failure we know, by `ApiError.code`. */
const WORDS: Readonly<Record<string, string>> = {
  user_already_exists: EMAIL_IN_USE,
  email_exists: EMAIL_IN_USE,
  invalid_credentials: "That email and password don't match.",
  over_request_rate_limit: TOO_MANY_TRIES,
  over_email_send_rate_limit: TOO_MANY_TRIES,
  [EMAIL_CONFIRMATION_REQUIRED]: "Confirm your email, then sign in.",
  [INVALID_ACCOUNT_PHONE]: PHILIPPINE_MOBILE_HINT,
  [NETWORK_FAILURE]: "Can't reach Courier. Check your connection and try again.",
};

/**
 * A failure in words a customer can act on. The server's own message is for us, not
 * them, so anything unrecognised gets one plain line and the detail goes to the log.
 */
export function customerMessage(error: unknown): string {
  const known = error instanceof ApiError && error.code ? WORDS[error.code] : undefined;
  if (known) return known;
  console.warn(error);
  return "Something went wrong. Try again.";
}

/**
 * Whether an email is worth sending to Auth: one `@`, a dot in the part after it, no
 * spaces and no empty labels. Auth checks properly; this only catches the slip early
 * enough to say which field is wrong.
 */
export function looksLikeEmail(text: string): boolean {
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(text);
}
