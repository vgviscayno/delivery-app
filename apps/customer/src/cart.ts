import {
  estimatedPeso,
  formatPeso,
  formatWeight,
  lineTotalCentavos,
  type Price,
  type Product,
} from "@courier/domain";

export interface CartLine {
  readonly productId: string;
  readonly name: string;
  readonly price: Price;
  readonly amount: number;
}

export type Cart = readonly CartLine[];

export const EMPTY_CART: Cart = [];

export type CartChange = (change: (cart: Cart) => Cart) => void;

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

export function changeAmount(cart: Cart, productId: string, amount: number): Cart {
  return cart.map((line) => (line.productId === productId ? { ...line, amount } : line));
}

export function removeLine(cart: Cart, productId: string): Cart {
  return cart.filter((line) => line.productId !== productId);
}

export function amountInCart(cart: Cart, productId: string): number | undefined {
  return cart.find((line) => line.productId === productId)?.amount;
}

type Priced = Pick<CartLine, "price" | "amount">;

export function startingAmount(price: Price, inCart: number | undefined): number {
  if (price.type === "per_unit") return inCart ?? 1;
  const step = price.weightStepGrams;
  return Math.max(Math.round((inCart ?? step) / step), 1) * step;
}

export function amountLabel({ price, amount }: Priced): string {
  return price.type === "per_weight" ? `~${formatWeight(amount)}` : `${amount} ×`;
}

function lineTotal(line: Priced): number {
  return line.price.type === "per_unit"
    ? line.price.unitPriceCentavos * line.amount
    : lineTotalCentavos(line.price.pricePerKgCentavos, line.amount);
}

export function lineTotalLabel(line: Priced): string {
  const centavos = lineTotal(line);
  return line.price.type === "per_weight"
    ? estimatedPeso(centavos)
    : formatPeso(centavos);
}

export function cartTotal(cart: Cart): { centavos: number; estimated: boolean } {
  return {
    centavos: cart.reduce((sum, line) => sum + lineTotal(line), 0),
    estimated: cart.some((line) => line.price.type === "per_weight"),
  };
}

export function cartTotalLabel(cart: Cart): string {
  const { centavos, estimated } = cartTotal(cart);
  return estimated ? estimatedPeso(centavos) : formatPeso(centavos);
}
