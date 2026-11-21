import {
  estimatedPeso,
  formatPeso,
  formatWeight,
  lineTotalCentavos,
  type Price,
  type Product,
} from "@courier/domain";

/**
 * One Product in the cart, as the customer last saw it: the name and price are a
 * snapshot from when it was added, so the total shows without the network.
 */
export interface CartLine {
  readonly productId: string;
  readonly name: string;
  readonly price: Price;
  /** Whole units for a per-unit Product; estimated grams for a per-weight one. */
  readonly amount: number;
}

/** The lines in the order they were first added, one per Product. */
export type Cart = readonly CartLine[];

export const EMPTY_CART: Cart = [];

/** An edit to the cart, as the screens hand one to whoever holds it. */
export type CartChange = (change: (cart: Cart) => Cart) => void;

/**
 * Puts a Product in the cart at this amount. A Product already there keeps its place
 * and takes the new amount and snapshot, rather than gaining a second line.
 */
export function putLine(cart: Cart, product: Product, amount: number): Cart {
  const line = {
    productId: product.id,
    name: product.name,
    price: product.price,
    amount,
  };
  return cart.some((l) => l.productId === product.id)
    ? cart.map((l) => (l.productId === product.id ? line : l))
    : [...cart, line];
}

/** Edits a line's amount from the cart itself, where only the snapshot is to hand. */
export function changeAmount(cart: Cart, productId: string, amount: number): Cart {
  return cart.map((line) => (line.productId === productId ? { ...line, amount } : line));
}

export function removeLine(cart: Cart, productId: string): Cart {
  return cart.filter((line) => line.productId !== productId);
}

/** How much of a Product the cart holds, or undefined when it holds none. */
export function amountInCart(cart: Cart, productId: string): number | undefined {
  return cart.find((line) => line.productId === productId)?.amount;
}

type Priced = Pick<CartLine, "price" | "amount">;

/**
 * Where the Product sheet starts: the cart's amount, else the least it sells. A cart
 * amount picked under an older weight step lands on the nearest step of this one.
 */
export function startingAmount(price: Price, inCart: number | undefined): number {
  if (price.type === "per_unit") return inCart ?? 1;
  const step = price.weightStepGrams;
  return Math.max(Math.round((inCart ?? step) / step), 1) * step;
}

/** The amount as shown: `~750 g` for a weight, `3 ×` for units. */
export function amountLabel({ price, amount }: Priced): string {
  return price.type === "per_weight" ? `~${formatWeight(amount)}` : `${amount} ×`;
}

/** A line's total in whole centavos; a per-weight one is rounded once, on its own. */
function lineTotal(line: Priced): number {
  return line.price.type === "per_unit"
    ? line.price.unitPriceCentavos * line.amount
    : lineTotalCentavos(line.price.pricePerKgCentavos, line.amount);
}

/** A line's total as shown, with `~` when it waits on the scale. */
export function lineTotalLabel(line: Priced): string {
  const centavos = lineTotal(line);
  return line.price.type === "per_weight"
    ? estimatedPeso(centavos)
    : formatPeso(centavos);
}

/** The running total, an estimate as soon as any line will be weighed. */
export function cartTotal(cart: Cart): { centavos: number; estimated: boolean } {
  return {
    centavos: cart.reduce((sum, line) => sum + lineTotal(line), 0),
    estimated: cart.some((line) => line.price.type === "per_weight"),
  };
}

/** The running total as shown: `~₱1,206.25` while any line waits on the scale. */
export function cartTotalLabel(cart: Cart): string {
  const { centavos, estimated } = cartTotal(cart);
  return estimated ? estimatedPeso(centavos) : formatPeso(centavos);
}
