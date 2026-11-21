import type { CourierClient } from "./client.js";

export interface AppStateSource {
  readonly currentState: string | null | undefined;
  addEventListener(type: "change", listener: (state: string) => void): { remove(): void };
}

export function refreshWhileActive(client: CourierClient, appState: AppStateSource) {
  if (appState.currentState === "active") void client.auth.startAutoRefresh();
  const subscription = appState.addEventListener("change", (state) => {
    if (state === "active") void client.auth.startAutoRefresh();
    else void client.auth.stopAutoRefresh();
  });
  return () => subscription.remove();
}

export function onSignedOut(client: CourierClient, listener: () => void) {
  const { data } = client.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") listener();
  });
  return () => data.subscription.unsubscribe();
}
