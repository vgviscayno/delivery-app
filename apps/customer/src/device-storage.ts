import { createChunkedStorage } from "@courier/api-client";
import * as SecureStore from "expo-secure-store";

/**
 * Where supabase-js keeps the session, refresh token included: encrypted at rest by a
 * Keystore-held key, so a customer stays signed in across launches until they sign out.
 */
export const sessionStorage = createChunkedStorage({
  getItemAsync: (key) => SecureStore.getItemAsync(key),
  setItemAsync: (key, value) => SecureStore.setItemAsync(key, value),
  deleteItemAsync: (key) => SecureStore.deleteItemAsync(key),
});
