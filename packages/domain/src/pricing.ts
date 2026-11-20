import type { Price } from "./catalog.js";

/**
 * A per-weight line's total in whole centavos: `price_per_kg × grams ÷ 1000`, rounded
 * to the nearest centavo once, at the end (ADR 0004). Halves round up, as Postgres
 * rounds a positive numeric, so the server can apply the same rule with `round()`.
 * The product is an exact integer: a rate and a weight this shop could charge stay far
 * below 2^53.
 */
export function lineTotalCentavos(pricePerKgCentavos: number, grams: number): number {
  return Math.round((pricePerKgCentavos * grams) / 1000);
}

/** The whole-kilogram chips, offered when the step divides them. */
const WHOLE_KG_CHIPS = [1000, 2000];

/**
 * The preset weights a customer picks a per-weight quantity from: the step, twice the
 * step, then 1 kg and 2 kg where they are multiples of the step. Ascending, no repeats,
 * so a chip is always a weight the stepper could also reach.
 */
export function weightChips(stepGrams: number): readonly number[] {
  const candidates = [stepGrams, stepGrams * 2, ...WHOLE_KG_CHIPS];
  const allowed = candidates.filter((grams) => isAllowedWeight(grams, stepGrams));
  return [...new Set(allowed)].sort((a, b) => a - b);
}

/** A weight a customer may ask for: a whole positive number of steps. */
function isAllowedWeight(grams: number, stepGrams: number): boolean {
  return Number.isInteger(grams) && grams >= stepGrams && grams % stepGrams === 0;
}

/**
 * The `Custom…` stepper: the next allowed weight above or below `grams`, never less
 * than one step. A weight off the step's grid lands on the nearest multiple that way.
 */
export function stepWeight(grams: number, stepGrams: number, direction: 1 | -1): number {
  const steps =
    direction === 1
      ? Math.floor(grams / stepGrams) + 1
      : Math.ceil(grams / stepGrams) - 1;
  return Math.max(steps, 1) * stepGrams;
}

/**
 * Whole centavos as pesos: `₱1,150`, or `₱575.50` when there are centavos. Built from
 * the digits rather than `Intl`, so Hermes builds without full ICU format it the same.
 */
export function formatPeso(centavos: number): string {
  const pesos = Math.trunc(centavos / 100);
  const rest = centavos % 100;
  const grouped = String(pesos).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return rest === 0 ? `₱${grouped}` : `₱${grouped}.${String(rest).padStart(2, "0")}`;
}

/** A figure that may change once the meat is weighed, which every estimate marks. */
export function estimatedPeso(centavos: number): string {
  return `~${formatPeso(centavos)}`;
}

/** `250 g` under a kilogram, `1 kg`, `1.5 kg` or `1.25 kg` from one up. */
export function formatWeight(grams: number): string {
  if (grams < 1000) return `${grams} g`;
  return `${String(grams / 1000)} kg`;
}

/** The price on a Product's card: flat per unit, or a rate per kilogram. */
export function shelfPrice(price: Price): string {
  return price.type === "per_unit"
    ? formatPeso(price.unitPriceCentavos)
    : `${formatPeso(price.pricePerKgCentavos)}/kg`;
}
