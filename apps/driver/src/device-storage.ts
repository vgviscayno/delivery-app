import * as SecureStore from "expo-secure-store";
import { createChunkedStorage } from "./chunked-storage";
import { parseRememberedDrivers, type RememberedDriver } from "./remembered-drivers";

// The device's own Keystore-backed storage. `AFTER_FIRST_UNLOCK` so a session survives
// the phone locking in the van, which the background location work will rely on.
const secureStore = {
  getItemAsync: (key: string) =>
    SecureStore.getItemAsync(key, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK }),
  setItemAsync: (key: string, value: string) =>
    SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
    }),
  deleteItemAsync: (key: string) => SecureStore.deleteItemAsync(key),
};

const storage = createChunkedStorage(secureStore);

/** Where supabase-js keeps the session, refresh token included: encrypted at rest. */
export const sessionStorage = storage;

const REMEMBERED_DRIVERS = "courier.remembered-drivers";

export async function loadRememberedDrivers(): Promise<RememberedDriver[]> {
  try {
    return parseRememberedDrivers(await storage.getItem(REMEMBERED_DRIVERS));
  } catch {
    return [];
  }
}

export async function saveRememberedDrivers(
  drivers: readonly RememberedDriver[],
): Promise<void> {
  await storage.setItem(REMEMBERED_DRIVERS, JSON.stringify(drivers));
}
