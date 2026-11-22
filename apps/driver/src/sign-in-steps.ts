import type { RememberedDriver } from "./remembered-drivers";

export type Step =
  | { readonly kind: "pick" }
  | { readonly kind: "password"; readonly driver: RememberedDriver }
  | { readonly kind: "someone-else" }
  | { readonly kind: "first-time" };

export function stepShown(chosen: Step, remembered: readonly RememberedDriver[]): Step {
  return chosen.kind === "pick" && remembered.length === 0
    ? { kind: "someone-else" }
    : chosen;
}
