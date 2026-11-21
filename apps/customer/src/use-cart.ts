import { useCallback, useEffect, useState } from "react";
import { type Cart, type CartChange, EMPTY_CART } from "./cart";
import { cartStore } from "./device-storage";

interface Held {
  readonly owner: string;
  readonly cart: Cart;
  /** Only an edit is saved: what was just read, or failed to be, stays as it is. */
  readonly edited: boolean;
}

/**
 * The signed-in customer's cart: read back from the phone once, then saved after each
 * edit. Null while it loads, and whenever no one is signed in. Clearing it on sign-out
 * is `clearCart`'s, since by then there is no customer to hold it for.
 */
export function useCart(userId: string | null): {
  cart: Cart | null;
  change: CartChange;
} {
  const [held, setHeld] = useState<Held | null>(null);

  useEffect(() => {
    if (userId === null) return;
    let live = true;
    void cartStore
      .load(userId)
      // A cart that cannot be read is one the customer rebuilds, not a broken shop.
      .catch(() => EMPTY_CART)
      .then((cart) => {
        if (live) setHeld({ owner: userId, cart, edited: false });
      });
    return () => {
      live = false;
      setHeld(null);
    };
  }, [userId]);

  const change = useCallback<CartChange>(
    (edit) =>
      setHeld(
        (current) => current && { ...current, cart: edit(current.cart), edited: true },
      ),
    [],
  );

  // Saved from here rather than inside `change`, so an updater stays pure.
  useEffect(() => {
    if (held?.edited) void cartStore.save(held.owner, held.cart).catch(() => {});
  }, [held]);

  return { cart: held?.owner === userId ? held.cart : null, change };
}

/** On sign-out, by the customer or by the server. Not when a resume merely failed. */
export function clearCart(): void {
  void cartStore.clear().catch(() => {});
}
