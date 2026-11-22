import { useEffect, useRef } from "react";
import { hasIdledOut } from "./idle.js";

const LAST_ACTIVITY_KEY = "courier.console.lastActivityAt";

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

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
    document.addEventListener("visibilitychange", check);

    return () => {
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, onActivity);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [timeoutMs]);
}
