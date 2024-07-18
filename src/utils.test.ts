import type { AsyncWrappedObject } from "./types.js";

function wrapAsyncObject<T extends object>(obj: T) {
  const wrappedFunctions = new WeakMap<Function, Function>();
  return new Proxy(obj, {
    get: (t, p) => {
      const value = Reflect.get(t, p);
      if (typeof value !== "function") return value;
      if (!wrappedFunctions.has(value)) {
        wrappedFunctions.set(
          value,
          async (...args: any[]) => await (value as Function)(...args)
        );
      }
      return wrappedFunctions.get(value);
    },
  }) as AsyncWrappedObject<T>;
}
