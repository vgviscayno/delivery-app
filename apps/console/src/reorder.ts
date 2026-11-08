import { useState } from "react";

/** The list with the item at `from` moved to `to`, or null if nothing moved. */
export function reordered(
  ids: readonly string[],
  from: number,
  to: number,
): string[] | null {
  if (from === to) return null;
  const next = [...ids];
  const [item] = next.splice(from, 1);
  if (item === undefined) return null;
  next.splice(to, 0, item);
  return next;
}

/**
 * A list order that follows the saved one, except while a drop is being saved: then it
 * shows the dropped order at once. `save` resolves once the write has settled and the
 * catalog has been read back (or the write failed), so dropping the override then shows
 * the saved order, which is the new order after a success and the old one after a failure.
 */
export function useOptimisticOrder(
  saved: readonly string[],
  save: (ids: readonly string[]) => Promise<boolean>,
) {
  const [dropped, setDropped] = useState<readonly string[] | null>(null);
  const order = dropped ?? saved;

  async function drop(from: number, to: number) {
    const next = reordered(order, from, to);
    if (!next) return;
    setDropped(next);
    await save(next);
    setDropped(null);
  }

  return { order, drop };
}
