import { useState } from "react";

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
