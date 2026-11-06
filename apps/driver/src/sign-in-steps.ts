import type { RememberedDriver } from "./remembered-drivers";

/** Where the sign-in screen is: the names on this phone, or one of its forms. */
export type Step =
  | { readonly kind: "pick" }
  | { readonly kind: "password"; readonly driver: RememberedDriver }
  | { readonly kind: "someone-else" }
  | { readonly kind: "first-time" };

/**
 * The step to show, given the one the driver last chose and the names this phone
 * remembers. With no names left there is nothing to pick from, so the list is the email
 * form instead -- on a phone nobody has used, and after removing the last name alike.
 */
export function stepShown(chosen: Step, remembered: readonly RememberedDriver[]): Step {
  return chosen.kind === "pick" && remembered.length === 0
    ? { kind: "someone-else" }
    : chosen;
}
