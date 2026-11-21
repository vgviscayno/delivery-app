import { createChunkedStorage } from "@courier/api-client";
import * as SecureStore from "expo-secure-store";
import { parseRememberedDrivers, type RememberedDriver } from "./remembered-drivers";

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
