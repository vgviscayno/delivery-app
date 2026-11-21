import type { AsyncStorage } from "@courier/api-client";
import type { Price } from "@courier/domain";
import { type Cart, type CartLine, EMPTY_CART } from "./cart";

/**
 * One slot on the phone, holding the cart and whose it is. A single slot rather than a
 * key per user, so signing out can always clear it: when the server ends a session,
 * the app no longer knows whose cart it would be clearing.
 */
const KEY = "cart";

interface Saved {
  readonly owner: string;
  readonly lines: Cart;
}

export interface CartStore {
  /** The cart this customer left on the phone; empty if it belongs to someone else. */
  load(userId: string): Promise<Cart>;
  save(userId: string, cart: Cart): Promise<void>;
  /** On sign-out, however it happened. */
  clear(): Promise<void>;
}

export function createCartStore(storage: AsyncStorage): CartStore {
  // A chunked save is several writes. Run everything on the slot in turn, so two saves
  // never interleave into a cart that will not parse, a save started before sign-out
  // cannot land after the clear, and a load never reads a half-written cart.
  let queue: Promise<unknown> = Promise.resolve();
  const inTurn = <T>(task: () => Promise<T>): Promise<T> => {
    const next = queue.then(task);
    queue = next.catch(() => {});
    return next;
  };

  return {
    load(userId) {
      return inTurn(async () => {
        const saved = parseSaved(await storage.getItem(KEY));
        return saved?.owner === userId ? saved.lines : EMPTY_CART;
      });
    },
    save(userId, cart) {
      const saved: Saved = { owner: userId, lines: cart };
      return inTurn(() => storage.setItem(KEY, JSON.stringify(saved)));
    },
    clear() {
      return inTurn(() => storage.removeItem(KEY));
    },
  };
}

/**
 * What is in the slot, if it is a cart this build can price. Anything else (an older
 * format, a half-written value) is no cart at all: a customer re-adds a line more
 * easily than they spot one that came back wrong.
 */
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

/** Whole units, or a weight in whole steps of at least one. */
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
