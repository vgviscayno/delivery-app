export interface KeyValueStore {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

export interface AsyncStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

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
  return chunks.length > 0 ? chunks : [""];
}

function safeKey(name: string): string {
  return name.replace(/[^\w.-]/g, "_");
}
