import { useCallback, useEffect, useState } from "react";
import { type Cart, type CartChange, EMPTY_CART } from "./cart";
import { cartStore } from "./device-storage";

interface Held {
  readonly owner: string;
  readonly cart: Cart;
  readonly edited: boolean;
}

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

  useEffect(() => {
    if (held?.edited) void cartStore.save(held.owner, held.cart).catch(() => {});
  }, [held]);

  return { cart: held?.owner === userId ? held.cart : null, change };
}

export function clearCart(): void {
  void cartStore.clear().catch(() => {});
}
