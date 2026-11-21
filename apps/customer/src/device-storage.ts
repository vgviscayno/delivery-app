import { createChunkedStorage } from "@courier/api-client";
import * as SecureStore from "expo-secure-store";
import { createCartStore } from "./cart-store";

const secureStorage = createChunkedStorage({
  getItemAsync: (key) => SecureStore.getItemAsync(key),
  setItemAsync: (key, value) => SecureStore.setItemAsync(key, value),
  deleteItemAsync: (key) => SecureStore.deleteItemAsync(key),
});

export const sessionStorage = secureStorage;

export const cartStore = createCartStore(secureStorage);
