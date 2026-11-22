import type { Price } from "./catalog.js";

export function lineTotalCentavos(pricePerKgCentavos: number, grams: number): number {
  return Math.round((pricePerKgCentavos * grams) / 1000);
}

const WHOLE_KG_CHIPS = [1000, 2000];

export function weightChips(stepGrams: number): readonly number[] {
  const candidates = [stepGrams, stepGrams * 2, ...WHOLE_KG_CHIPS];
  const allowed = candidates.filter((grams) => isAllowedWeight(grams, stepGrams));
  return [...new Set(allowed)].sort((a, b) => a - b);
}

function isAllowedWeight(grams: number, stepGrams: number): boolean {
  return Number.isInteger(grams) && grams >= stepGrams && grams % stepGrams === 0;
}

export function stepWeight(grams: number, stepGrams: number, direction: 1 | -1): number {
  const steps =
    direction === 1
      ? Math.floor(grams / stepGrams) + 1
      : Math.ceil(grams / stepGrams) - 1;
  return Math.max(steps, 1) * stepGrams;
}

export function formatPeso(centavos: number): string {
  const pesos = Math.trunc(centavos / 100);
  const rest = centavos % 100;
  const grouped = String(pesos).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return rest === 0 ? `₱${grouped}` : `₱${grouped}.${String(rest).padStart(2, "0")}`;
}

export function estimatedPeso(centavos: number): string {
  return `~${formatPeso(centavos)}`;
}

export function formatWeight(grams: number): string {
  if (grams < 1000) return `${grams} g`;
  return `${String(grams / 1000)} kg`;
}

export function shelfPrice(price: Price): string {
  return price.type === "per_unit"
    ? formatPeso(price.unitPriceCentavos)
    : `${formatPeso(price.pricePerKgCentavos)}/kg`;
}
