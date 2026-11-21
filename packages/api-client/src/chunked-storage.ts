/**
 * Session storage for supabase-js on a phone, backed by `expo-secure-store`.
 *
 * SecureStore encrypts each value with a key held in the Android Keystore, which is
 * what keeps the refresh token encrypted at rest. But it caps a value at 2048 bytes,
 * and a supabase-js session -- two JWTs and the user -- is larger. So each value is
 * split across numbered entries, and the entry under the key itself holds the count.
 *
 * One value is therefore several native calls, so the calls on each key run in turn:
 * two writes never interleave into a value that reads back as nothing, and a write
 * under way never lands after a removal that followed it.
 */

/** The part of `expo-secure-store` this needs; in-memory in the tests. */
export interface KeyValueStore {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

/** The storage interface supabase-js's `auth.storage` takes. */
export interface AsyncStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

// Counted in code points, at most 4 bytes each in UTF-8, so a chunk never passes 2000
// bytes and a surrogate pair is never split between two entries.
const CODE_POINTS_PER_CHUNK = 500;

export function createChunkedStorage(store: KeyValueStore): AsyncStorage {
  async function countOf(key: string): Promise<number> {
    const count = Number(await store.getItemAsync(key));
    return Number.isInteger(count) && count > 0 ? count : 0;
  }

  async function removeChunks(key: string, from: number, to: number) {
    for (let index = from; index < to; index++) {
      await store.deleteItemAsync(`${key}.${index}`);
    }
  }

  // The last call queued on each key, settled or not; a failed call never blocks the next.
  const queues = new Map<string, Promise<unknown>>();
  function inTurn<T>(key: string, task: () => Promise<T>): Promise<T> {
    const next = (queues.get(key) ?? Promise.resolve()).then(task);
    queues.set(
      key,
      next.catch(() => {}),
    );
    return next;
  }

  async function read(key: string): Promise<string | null> {
    const count = await countOf(key);
    if (count === 0) return null;

    const chunks: string[] = [];
    for (let index = 0; index < count; index++) {
      const chunk = await store.getItemAsync(`${key}.${index}`);
      // Half a session is not a session.
      if (chunk === null) return null;
      chunks.push(chunk);
    }
    return chunks.join("");
  }

  async function write(key: string, value: string): Promise<void> {
    const previous = await countOf(key);
    const chunks = split(value);

    for (const [index, chunk] of chunks.entries()) {
      await store.setItemAsync(`${key}.${index}`, chunk);
    }
    await store.setItemAsync(key, String(chunks.length));
    await removeChunks(key, chunks.length, previous);
  }

  async function remove(key: string): Promise<void> {
    const count = await countOf(key);
    await store.deleteItemAsync(key);
    await removeChunks(key, 0, count);
  }

  return {
    getItem(name) {
      const key = safeKey(name);
      return inTurn(key, () => read(key));
    },
    setItem(name, value) {
      const key = safeKey(name);
      return inTurn(key, () => write(key, value));
    },
    removeItem(name) {
      const key = safeKey(name);
      return inTurn(key, () => remove(key));
    },
  };
}

function split(value: string): string[] {
  const codePoints = Array.from(value);
  const chunks: string[] = [];
  for (let start = 0; start < codePoints.length; start += CODE_POINTS_PER_CHUNK) {
    chunks.push(codePoints.slice(start, start + CODE_POINTS_PER_CHUNK).join(""));
  }
  // An empty value is still a value: one empty chunk, so it reads back as "".
  return chunks.length > 0 ? chunks : [""];
}

/** SecureStore accepts only letters, digits, `.`, `-` and `_` in a key. */
function safeKey(name: string): string {
  return name.replace(/[^\w.-]/g, "_");
}
