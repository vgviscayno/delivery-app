import type { AsyncStorage } from "@courier/api-client";
import type { Price } from "@courier/domain";
import { type Cart, type CartLine, EMPTY_CART } from "./cart";

const KEY = "cart";

interface Saved {
  readonly owner: string;
  readonly lines: Cart;
}

export interface CartStore {
  load(userId: string): Promise<Cart>;
  save(userId: string, cart: Cart): Promise<void>;
  clear(): Promise<void>;
}

export function createCartStore(storage: AsyncStorage): CartStore {
  return {
    async load(userId) {
      const saved = parseSaved(await storage.getItem(KEY));
      return saved?.owner === userId ? saved.lines : EMPTY_CART;
    },
    save(userId, cart) {
      const saved: Saved = { owner: userId, lines: cart };
      return storage.setItem(KEY, JSON.stringify(saved));
    },
    clear() {
      return storage.removeItem(KEY);
    },
  };
}

function parseSaved(raw: string | null): Saved | null {
  if (raw === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value) || typeof value.owner !== "string") return null;
  const { lines } = value;
  if (!Array.isArray(lines) || !lines.every(isCartLine)) return null;
  return { owner: value.owner, lines };
}

function isCartLine(value: unknown): value is CartLine {
  return (
    isRecord(value) &&
    typeof value.productId === "string" &&
    typeof value.name === "string" &&
    isPrice(value.price) &&
    isAmount(value.amount, value.price)
  );
}

function isPrice(value: unknown): value is Price {
  if (!isRecord(value)) return false;
  if (value.type === "per_unit") return isWholeCentavos(value.unitPriceCentavos);
  return (
    value.type === "per_weight" &&
    isWholeCentavos(value.pricePerKgCentavos) &&
    isPositiveInteger(value.weightStepGrams) &&
    isPositiveInteger(value.toleranceGrams)
  );
}

function isAmount(amount: unknown, price: Price): boolean {
  if (!isPositiveInteger(amount)) return false;
  return price.type === "per_unit" || amount % price.weightStepGrams === 0;
}

function isWholeCentavos(value: unknown): boolean {
  return Number.isInteger(value) && (value as number) >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
