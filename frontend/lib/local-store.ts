// Client-side only: import it from Client Components, never from Server Components.
import { useSyncExternalStore } from "react";

export interface LocalStore<T> {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => T;
  getServerSnapshot: () => T;
  set: (value: T) => void;
  clear: () => void;
}

interface LocalStoreOptions<T> {
  key: string;
  /** Value used on the server, during hydration and when nothing is stored */
  fallback: T;
  parse: (raw: string) => T;
  serialize?: (value: T) => string;
  storage?: "local" | "session";
}

/**
 * A localStorage/sessionStorage value that React can subscribe to.
 *  - The server (and the first hydration render) use `fallback`, so HTML never mismatches.
 *  - getSnapshot caches by the raw string: React needs the SAME object while nothing changed.
 *  - Other tabs are kept in sync through the "storage" event.
 */
export function createLocalStore<T>({
  key,
  fallback,
  parse,
  serialize = JSON.stringify,
  storage = "local",
}: LocalStoreOptions<T>): LocalStore<T> {
  const listeners = new Set<() => void>();
  let cachedRaw: string | null | undefined; // undefined = never read yet
  let cachedValue: T = fallback;

  const getStorage = (): Storage | null => {
    try {
      return storage === "local" ? window.localStorage : window.sessionStorage;
    } catch {
      return null; // storage blocked (private mode, browser settings)
    }
  };

  const notify = () => listeners.forEach((listener) => listener());

  function getSnapshot(): T {
    let raw: string | null = null;
    try {
      raw = getStorage()?.getItem(key) ?? null;
    } catch {
      raw = null;
    }

    if (raw !== cachedRaw) {
      cachedRaw = raw;
      try {
        cachedValue = raw === null ? fallback : parse(raw);
      } catch {
        cachedValue = fallback; // corrupted value: behave as if nothing is stored
      }
    }
    return cachedValue;
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    const onStorage = (event: StorageEvent) => {
      if (event.key === key || event.key === null) listener();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  }

  return {
    subscribe,
    getSnapshot,
    getServerSnapshot: () => fallback,
    set(value) {
      try {
        getStorage()?.setItem(key, serialize(value));
      } catch {
        /* quota exceeded or blocked: ignore */
      }
      notify();
    },
    clear() {
      try {
        getStorage()?.removeItem(key);
      } catch {
        /* ignore */
      }
      notify();
    },
  };
}

export function useLocalStore<T>(store: LocalStore<T>): T {
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
}

const subscribeNothing = () => () => {};

/** false on the server and during hydration, true afterwards */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
}
