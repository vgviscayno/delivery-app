import type { CourierClient } from "./client.js";

/** The part of React Native's `AppState` this needs, so this package never imports it. */
export interface AppStateSource {
  readonly currentState: string | null | undefined;
  addEventListener(type: "change", listener: (state: string) => void): { remove(): void };
}

/**
 * Keeps a phone's session fresh while the app is in front. supabase-js refreshes the
 * token on a timer, which a backgrounded app cannot keep, so it runs only while the app
 * is active, as Supabase advises for React Native. Returns the clean-up.
 */
export function refreshWhileActive(client: CourierClient, appState: AppStateSource) {
  if (appState.currentState === "active") void client.auth.startAutoRefresh();
  const subscription = appState.addEventListener("change", (state) => {
    if (state === "active") void client.auth.startAutoRefresh();
    else void client.auth.stopAutoRefresh();
  });
  return () => subscription.remove();
}

/**
 * Calls back when supabase-js lets go of the session on its own: a refresh token that
 * stopped working (the account was deactivated, or signed out everywhere) signs this
 * phone out too, and the screen must not outlive the session. Returns the clean-up.
 */
export function onSignedOut(client: CourierClient, listener: () => void) {
  const { data } = client.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") listener();
  });
  return () => data.subscription.unsubscribe();
}
