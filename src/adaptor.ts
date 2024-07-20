import Emitter from "@cch137/emitter";
import { serialize, parse } from "@cch137/shuttle";
import type {
  EntangledObject,
  ClientRequest,
  ServerFunctionReturn,
  ServerResponse,
  Adaptor,
} from "./types.js";

export const Entangled = Symbol("Entangled");
export const Connect = Symbol("Connect");
export const Disconnect = Symbol("Disconnect");
export const OnReady = Symbol("OnReady");

export type AdaptorOptions = {
  timeout?: number;
  salts?: number[];
  md5?: boolean;
};

export type EntangledClient<
  T extends object,
  OmittedKeys extends Array<keyof T> | undefined = undefined,
  PickedKeys extends Array<keyof T> | undefined = undefined,
  ReadonlyKeys extends Array<keyof T> | undefined = undefined
> = EntangledObject<T, OmittedKeys, PickedKeys, ReadonlyKeys> & {
  [Entangled]?: boolean;
  [Connect]?: () => void;
  [Disconnect]?: () => void;
  [OnReady]: Set<() => void>;
};

export default function createAdaptor<
  T extends object,
  OmittedKeys extends Array<keyof T> | undefined = undefined,
  PickedKeys extends Array<keyof T> | undefined = undefined,
  ReadonlyKeys extends Array<keyof T> | undefined = undefined
>(
  adaptorConstructor: (
    onopen: () => void,
    onmessage: (data: Uint8Array) => void,
    ondestroy?: () => void
  ) => Adaptor,
  options: AdaptorOptions = {}
) {
  let props: any = {};
  const { timeout = 10000, ...shuttleOptions } = options;
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
          serialize(
            {
              op: "call",
              name,
              uuid,
              args,
            } as ClientRequest<T>,
            shuttleOptions
          )
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
    const pack = parse<ServerResponse>(data, shuttleOptions);
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
      case "ready": {
        onreadyCallbacks.forEach(async (cb) => cb());
        break;
      }
    }
  };

  const { isEntangled, connect, disconnect, send } = adaptorConstructor(
    onopen,
    onmessage
  );

  const onreadyCallbacks = new Set<() => void>();

  return new Proxy(props, {
    has: (t, p) => {
      return Reflect.has(t, p);
    },
    get: (t, p) => {
      switch (p) {
        case Connect:
          return connect;
        case Disconnect:
          return disconnect;
        case Entangled:
          return isEntangled();
        case OnReady:
          return onreadyCallbacks;
        default:
          return Reflect.get(t, p);
      }
    },
    set: (t, p, v) => {
      t[p] = v;
      if (typeof v === "function")
        throw new Error("Cannot set a function attribute to this object.");
      send(
        serialize(
          { op: "set", key: p, value: v } as ClientRequest<T>,
          shuttleOptions
        )
      );
      return Reflect.set(t, p, v);
    },
    deleteProperty: (t, p) => {
      send(
        serialize(
          {
            op: "set",
            key: p,
            value: undefined,
          } as ClientRequest<T>,
          shuttleOptions
        )
      );
      return Reflect.deleteProperty(t, p);
    },
  }) as EntangledClient<T, OmittedKeys, PickedKeys, ReadonlyKeys>;
}

createAdaptor.Entangled = Entangled;
createAdaptor.Connect = Connect;
createAdaptor.Disconnect = Disconnect;
createAdaptor.OnReady = OnReady;
