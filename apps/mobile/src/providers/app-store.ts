// Store esterno per lo stato dell'AppProvider.
// Un context React con un unico oggetto fa ri-renderizzare ogni consumer a
// qualsiasi cambiamento (anche `saving`). Con questo store ogni componente si
// iscrive solo ai campi che legge (vedi `useAppState`), e le azioni sono
// esposte come funzioni stabili che invocano sempre l'implementazione corrente.

type Listener = () => void;
type AnyFunction = (...args: never[]) => unknown;

export type AppStore<T extends object> = {
  get: () => T;
  set: (next: T) => void;
  subscribe: (listener: Listener) => () => void;
};

function shallowEqual<T extends object>(left: T, right: T) {
  const keys = Object.keys(left) as (keyof T)[];
  if (keys.length !== Object.keys(right).length) return false;
  return keys.every((key) => Object.is(left[key], right[key]));
}

export function createAppStore<T extends object>(initial: T): AppStore<T> {
  let latest = initial;
  const stableFunctions = new Map<keyof T, AnyFunction>();
  const listeners = new Set<Listener>();

  const stabilize = (value: T) => {
    const result = { ...value };
    (Object.keys(value) as (keyof T)[]).forEach((key) => {
      if (typeof value[key] !== 'function') return;
      let stable = stableFunctions.get(key);
      if (!stable) {
        stable = (...args: never[]) => (latest[key] as unknown as AnyFunction)(...args);
        stableFunctions.set(key, stable);
      }
      result[key] = stable as T[keyof T];
    });
    return result;
  };

  let snapshot = stabilize(initial);

  return {
    get: () => snapshot,
    set: (next) => {
      latest = next;
      const nextSnapshot = stabilize(next);
      if (shallowEqual(nextSnapshot, snapshot)) return;
      snapshot = nextSnapshot;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
