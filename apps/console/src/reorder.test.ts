// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { reordered, useOptimisticOrder } from "./reorder.js";

describe("reordered", () => {
  const ids = ["beef", "pork", "chicken", "fish"];

  it("moves an item down the list", () => {
    expect(reordered(ids, 0, 2)).toEqual(["pork", "chicken", "beef", "fish"]);
  });

  it("moves an item up the list", () => {
    expect(reordered(ids, 3, 1)).toEqual(["beef", "fish", "pork", "chicken"]);
  });

  it("is null when the item lands where it started", () => {
    expect(reordered(ids, 2, 2)).toBeNull();
  });
});

/** A save that stays in flight until the test settles it. */
function pendingSave() {
  let settle: (saved: boolean) => void = () => {};
  const save = vi.fn(
    (_ids: readonly string[]) =>
      new Promise<boolean>((resolve) => {
        settle = resolve;
      }),
  );
  return { save, settle: (saved: boolean) => settle(saved) };
}

describe("useOptimisticOrder", () => {
  const saved = ["beef", "pork", "chicken"];

  it("shows a drop's order at once and saves the full order in one call", async () => {
    const { save, settle } = pendingSave();
    const { result } = renderHook(() => useOptimisticOrder(saved, save));

    act(() => void result.current.drop(2, 0));

    expect(result.current.order).toEqual(["chicken", "beef", "pork"]);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(["chicken", "beef", "pork"]);
    await act(async () => settle(true));
  });

  it("goes back to the saved order when the save fails", async () => {
    const { save, settle } = pendingSave();
    const { result } = renderHook(() => useOptimisticOrder(saved, save));

    act(() => void result.current.drop(0, 1));
    expect(result.current.order).toEqual(["pork", "beef", "chicken"]);
    await act(async () => settle(false));

    expect(result.current.order).toEqual(["beef", "pork", "chicken"]);
  });

  it("saves nothing when the item is dropped where it started", async () => {
    const { save } = pendingSave();
    const { result } = renderHook(() => useOptimisticOrder(saved, save));

    await act(() => result.current.drop(1, 1));

    expect(save).not.toHaveBeenCalled();
    expect(result.current.order).toEqual(saved);
  });

  it("follows the saved order once a save has been read back", async () => {
    const { save, settle } = pendingSave();
    const { result, rerender } = renderHook(
      ({ order }) => useOptimisticOrder(order, save),
      { initialProps: { order: saved } },
    );

    act(() => void result.current.drop(0, 2));
    rerender({ order: ["pork", "chicken", "beef"] });
    await act(async () => settle(true));

    expect(result.current.order).toEqual(["pork", "chicken", "beef"]);
  });
});
