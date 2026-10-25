import { useEffect, useRef } from "react";
import { hasIdledOut } from "./idle.js";

/**
 * When this browser last saw the dispatcher do anything. Kept in localStorage rather
 * than in memory, so every console tab shares one idea of "idle" -- typing in one tab
 * keeps the others alive -- and a session restored after the browser was closed is
 * judged by when it was last used, not by when it was reopened.
 */
const LAST_ACTIVITY_KEY = "courier.console.lastActivityAt";

/** What counts as the dispatcher being there. Pointer movement alone does not. */
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

/** How often to look. The sign-out lands at most this long after the timeout. */
const CHECK_EVERY_MS = 10_000;

export function recordActivity(at: number = Date.now()): void {
  localStorage.setItem(LAST_ACTIVITY_KEY, String(at));
}

export function clearActivity(): void {
  localStorage.removeItem(LAST_ACTIVITY_KEY);
}

export function readLastActivity(): number | null {
  const stored = Number(localStorage.getItem(LAST_ACTIVITY_KEY));
  return Number.isFinite(stored) && stored > 0 ? stored : null;
}

/**
 * Calls `onIdle` once the console has gone `timeoutMs` without activity in any tab.
 * Mount it only while a dispatcher is signed in.
 */
export function useIdleSignOut(timeoutMs: number, onIdle: () => void): void {
  const latestOnIdle = useRef(onIdle);
  latestOnIdle.current = onIdle;

  useEffect(() => {
    recordActivity();

    const onActivity = () => recordActivity();
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, onActivity, { passive: true });
    }

    const check = () => {
      if (hasIdledOut(readLastActivity(), Date.now(), timeoutMs)) latestOnIdle.current();
    };
    const timer = window.setInterval(check, CHECK_EVERY_MS);
    // A laptop lid closed past the timeout: check the moment the tab is looked at again.
    document.addEventListener("visibilitychange", check);

    return () => {
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, onActivity);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [timeoutMs]);
}
