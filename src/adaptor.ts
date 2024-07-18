import Emitter from "@cch137/emitter";
import Shuttle from "@cch137/shuttle";
import {
  ASOClientObject,
  ClientRequest,
  ServerFunctionReturn,
  ServerResponse,
} from "./types.js";

export default function createClientAdaptor<
  T extends object,
  O extends Array<keyof T> | undefined = undefined,
  P extends Array<keyof T> | undefined = undefined
>(
  Adaptor: (
    onopen: () => void,
    onmessage: (data: Uint8Array) => void
  ) => (data: Uint8Array) => void,
  options: { timeout?: number } = {}
) {
  let props: any = {};
  const { timeout = 10000 } = options;
  const emitter = new Emitter<{
    [uuid: string]: [value: ServerFunctionReturn];
  }>();

  const callFunction = (name: string, args: any[]) =>
    new Promise((resolve, reject) => {
      const uuid = crypto.randomUUID();
      const tOut = setTimeout(() => {
        emitter.off(uuid, listener);
        reject(new Error("Timeout"));
      }, timeout);
      const listener = (data: ServerFunctionReturn) => {
        clearTimeout(tOut);
        if ("error" in data) {
          reject(new Error(data.message));
        } else {
          resolve(data.value);
        }
      };
      emitter.once(uuid, listener);
      try {
        send(
          Shuttle.serialize({
            op: "call",
            name,
            uuid,
            args,
          } as ClientRequest<T>)
        );
      } catch (e) {
        reject(e);
        clearTimeout(tOut);
        emitter.off(uuid, listener);
      }
    });

  const onopen = () => {
    for (const key in props) delete props[key];
  };

  const onmessage = (data: Uint8Array) => {
    const pack = Shuttle.parse<ServerResponse>(data);
    switch (pack.op) {
      case "set": {
        const { key, value, func } = pack;
        if (func) {
          Reflect.set(props, key, (...args: any[]) => callFunction(key, args));
        } else {
          Reflect.set(props, key, value);
        }
        break;
      }
      case "return": {
        emitter.emit(pack.uuid, pack);
        break;
      }
    }
  };

  const send = Adaptor(onopen, onmessage);

  return new Proxy(props, {
    has: (t, p) => {
      return Reflect.has(t, p);
    },
    get: (t, p) => {
      return Reflect.get(t, p);
    },
    set: (t, p, v) => {
      t[p] = v;
      if (typeof v === "function")
        throw new Error("Cannot set a function attribute to this object.");
      send(
        Shuttle.serialize({ op: "set", key: p, value: v } as ClientRequest<T>)
      );
      return Reflect.set(t, p, v);
    },
    deleteProperty: (t, p) => {
      send(
        Shuttle.serialize({
          op: "set",
          key: p,
          value: undefined,
        } as ClientRequest<T>)
      );
      return Reflect.deleteProperty(t, p);
    },
    defineProperty: () => {
      throw new Error("Cannot define property of this object");
    },
    getOwnPropertyDescriptor: () => {
      throw new Error("Cannot get own property descriptor of this object");
    },
  }) as ASOClientObject<T, O, P>;
}
