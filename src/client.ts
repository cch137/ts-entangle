import Emitter, { type ExtractEventMap } from "@cch137/emitter";
import { serialize, parse } from "@cch137/shuttle";
import type {
  EntangledObject,
  ClientRequest,
  ServerFunctionReturn,
  ServerResponse,
  UUID,
} from "./types.js";

export const Adaptor = Symbol("Adaptor");

export const Ready = Symbol("Ready");

type WebSocketLike = { send: (data: Uint8Array) => void; close: () => void };

type SocketBuilder = (emitter: AdaptorSocketEmitter) => WebSocketLike;

type AdaptorSocketEmitter = Emitter<{
  connect: [];
  message: [data: Uint8Array];
  disconnect: [];
}>;

export class EntangleAdaptor extends Emitter<
  ExtractEventMap<AdaptorSocketEmitter> & {
    ready: [];
  } & {
    [uuid: UUID]: [value: ServerFunctionReturn];
  }
> {
  websocket?: WebSocketLike;

  // controlled by methods
  active: boolean;

  // Controlled by external listeners
  connected = false;
  ready = false;

  // option: keep properties after disconnected
  cached: boolean;

  builder: SocketBuilder;

  constructor(
    builder: SocketBuilder,
    options?: { active?: boolean; cached?: boolean }
  );
  constructor(builder: SocketBuilder, { active = true, cached = true } = {}) {
    super();
    this.builder = builder;
    this.active = active;
    this.cached = cached;
    if (active) this.websocket = builder(this);
  }

  connect() {
    this.active = true;
    if (this.websocket) return;
    this.websocket = this.builder(this);
  }

  disconnect() {
    this.active = false;
    this.websocket?.close();
    this.websocket = undefined;
  }

  send(data: Uint8Array) {
    this.websocket?.send(data);
  }
}

export type EntangleOptions = {
  timeout?: number;
  salts?: number[];
  md5?: boolean;
  pending?: boolean;
  cached?: boolean;
};

export type EntangledClient<
  T extends object,
  OmittedKeys extends Array<keyof T> | undefined = undefined,
  PickedKeys extends Array<keyof T> | undefined = undefined,
  ReadonlyKeys extends Array<keyof T> | undefined = undefined
> = EntangledObject<T, OmittedKeys, PickedKeys, ReadonlyKeys> & {
  [Adaptor]: EntangleAdaptor;
  [Ready]: () => Promise<
    EntangledClient<T, OmittedKeys, PickedKeys, ReadonlyKeys>
  >;
};

export default function createEntangleClient<
  T extends object,
  OmittedKeys extends Array<keyof T> | undefined = undefined,
  PickedKeys extends Array<keyof T> | undefined = undefined,
  ReadonlyKeys extends Array<keyof T> | undefined = undefined
>(builder: SocketBuilder, options: EntangleOptions = {}) {
  type Entangled = EntangledClient<T, OmittedKeys, PickedKeys, ReadonlyKeys>;

  let props: any = {};
  const {
    timeout = 10000,
    pending = false,
    cached = true,
    ...shuttleOptions
  } = options;
  const adaptor = new EntangleAdaptor(builder, { active: !pending, cached });

  const callFunction = (name: string, args: any[]) =>
    new Promise((resolve, reject) => {
      const uuid = crypto.randomUUID();
      const tOut = setTimeout(() => {
        adaptor.off(uuid, listener);
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
      adaptor.once(uuid, listener);
      try {
        adaptor.send(
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
        adaptor.off(uuid, listener);
      }
    });

  adaptor.on("connect", () => {
    adaptor.connected = true;
  });

  adaptor.on("ready", () => {
    adaptor.ready = true;
  });

  adaptor.on("message", (data) => {
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
        adaptor.emit(pack.uuid, pack);
        break;
      }
      case "ready": {
        adaptor.emit("ready");
        onreadyCallbacks.forEach(async (cb) => cb());
        break;
      }
    }
  });

  adaptor.on("disconnect", () => {
    adaptor.websocket = undefined;
    adaptor.connected = false;
    adaptor.ready = false;
    if (adaptor.active) {
      adaptor.connect();
    } else if (!adaptor.cached) {
      for (const key in props) Reflect.deleteProperty(props, key);
    }
  });

  const onreadyCallbacks = new Set<() => void>();

  const proxy = new Proxy(props, {
    has: (t, p) => {
      return Reflect.has(t, p);
    },
    get: (t, p) => {
      switch (p) {
        case Adaptor:
          return adaptor;
        case Ready:
          return (cb?: (t: Entangled) => void) => {
            return new Promise<Entangled>((resolve, reject) => {
              if (adaptor.ready) {
                if (cb) cb(proxy);
                resolve(proxy);
                return;
              }
              const tout = setTimeout(
                () => reject(new Error("Timeout")),
                timeout
              );
              adaptor.once("ready", () => {
                clearTimeout(tout);
                if (cb) cb(proxy);
                resolve(proxy);
              });
            });
          };
        default:
          return Reflect.get(t, p);
      }
    },
    set: (t, p, v) => {
      t[p] = v;
      if (typeof v === "function")
        throw new Error("Cannot set a function attribute to this object.");
      adaptor.send(
        serialize(
          { op: "set", key: p, value: v } as ClientRequest<T>,
          shuttleOptions
        )
      );
      return Reflect.set(t, p, v);
    },
    deleteProperty: (t, p) => {
      adaptor.send(
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
  }) as Entangled;

  return proxy;
}

createEntangleClient.Adaptor = Adaptor;
createEntangleClient.Ready = Ready;
