import { createChunkedStorage } from "@courier/api-client";
import * as SecureStore from "expo-secure-store";
import { createCartStore } from "./cart-store";

/**
 * SecureStore, chunked past its 2048-byte cap. Encrypted at rest by a Keystore-held
 * key, and it outlives a relaunch, which is all the cart needs as well.
 */
const secureStorage = createChunkedStorage({
  getItemAsync: (key) => SecureStore.getItemAsync(key),
  setItemAsync: (key, value) => SecureStore.setItemAsync(key, value),
  deleteItemAsync: (key) => SecureStore.deleteItemAsync(key),
});

/**
 * Where supabase-js keeps the session, refresh token included, so a customer stays
 * signed in across launches until they sign out.
 */
export const sessionStorage = secureStorage;

/** The cart on this phone, kept until checkout or sign-out. */
export const cartStore = createCartStore(secureStorage);
