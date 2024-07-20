import Shuttle from "@cch137/shuttle";
import { WebSocket } from "ws";
import type { ClientRequest, ServerResponse, ServerSetter } from "./types.js";

const Handle = Symbol("Handle");

export type KeyPermission<T> = {
  key: keyof T;
  readable?: boolean;
  writable?: boolean;
};

export type EntangleServerOptions<T extends object> = {
  pickedKeys?: (keyof T)[];
  omittedKeys?: (keyof T)[];
  readonlyKeys?: (keyof T)[];
  clientReadonly?: boolean;
  permissions?: KeyPermission<T>[];
};

export default function createEntangleServer<T extends object>(
  target: T,
  options: EntangleServerOptions<T> = {}
) {
  const clients = new Set<Client>();

  const readables = new Map<keyof T, boolean>();
  const writables = new Map<keyof T, boolean>();

  const isReadable = (key: keyof T) => readables.get(key) ?? true;
  const isWritable = (key: keyof T) => readables.get(key) ?? true;

  {
    const {
      pickedKeys,
      omittedKeys,
      readonlyKeys = [],
      clientReadonly = false,
      permissions,
    } = options;

    const keys = (Object.getOwnPropertyNames(target) as (keyof T)[])
      .concat(pickedKeys || [], omittedKeys || [], readonlyKeys)
      .reduce((prev, curr) => {
        if (!prev.includes(curr)) prev.push(curr);
        return prev;
      }, [] as (keyof T)[]);

    for (const key of keys) {
      if (
        (omittedKeys && omittedKeys.includes(key)) ||
        (pickedKeys && !pickedKeys.includes(key))
      ) {
        readables.set(key, false);
        writables.set(key, false);
        continue;
      }
      const permission = permissions?.find((i) => i.key === key);
      if (!permission) {
        readables.set(key, true);
        writables.set(key, !clientReadonly && true);
        continue;
      }
      const { readable, writable } = permission;
      readables.set(key, readable ?? true);
      writables.set(
        key,
        clientReadonly || readonlyKeys.includes(key)
          ? false
          : writable ?? readable ?? true
      );
    }
  }

  class Client {
    readonly socket: WebSocket;

    constructor(socket: WebSocket) {
      this.socket = socket;
    }

    send(response: ServerResponse) {
      this.socket.send(Shuttle.serialize(response));
    }

    sync(key: keyof T, clear = false) {
      if (!isWritable(key)) {
        if (!clear) return;
        this.send({
          op: "set",
          key: String(key),
          value: undefined,
          func: false,
        });
        return;
      }
      const value = target[key];
      const func = typeof value === "function";
      if (func) {
        this.send({
          op: "set",
          key: String(key),
          value: undefined,
          func,
        });
      } else {
        this.send({
          op: "set",
          key: String(key),
          value,
          func,
        });
      }
    }
  }

  function handleSocket(soc: WebSocket) {
    const client = new Client(soc);
    clients.add(client);

    for (const key in target) {
      client.sync(key);
    }

    soc.on("message", async (data) => {
      if (Array.isArray(data)) data = Buffer.concat(data);

      const pack = Shuttle.parse<ClientRequest<T>>(
        data instanceof ArrayBuffer
          ? new Uint8Array(data)
          : Uint8Array.from(data)
      );

      switch (pack.op) {
        case "set": {
          const { key, value } = pack;
          if (isWritable(key)) proxy[key] = value;
          else client.sync(key, true);
          break;
        }
        case "call": {
          const { uuid, name, args } = pack;
          const func = (target as any)[name];
          try {
            if (typeof func !== "function" || !isReadable(name as keyof T))
              throw new Error(`"${name}" is not a function`);
            client.send({
              op: "return",
              uuid,
              value: await func(...args),
            });
          } catch (e) {
            client.send({
              op: "return",
              uuid,
              error: true,
              message:
                e instanceof Error ? e.message : String(e || "Unknown Error"),
            });
          }
          break;
        }
      }
    });

    soc.on("close", () => {
      clients.delete(client);
    });
  }

  const proxy = new Proxy(target, {
    get(t, p) {
      if (p === Handle) return handleSocket;
      return Reflect.get(t, p);
    },
    set: (t, p, v) => {
      try {
        return Reflect.set(t, p, v);
      } catch {
        return false;
      } finally {
        if (isReadable(p as keyof T)) {
          const value = Reflect.get(t, p);
          const pack: ServerSetter =
            typeof value === "function"
              ? { op: "set", func: true, key: String(p), value: undefined }
              : {
                  op: "set",
                  func: false,
                  key: String(p),
                  value,
                };
          clients.forEach((c) => c.send(pack));
        }
      }
    },
    deleteProperty: (t, p) => {
      try {
        return Reflect.deleteProperty(t, p);
      } catch {
        return false;
      } finally {
        if (isReadable(p as keyof T)) {
          const pack: ServerSetter = {
            op: "set",
            func: false,
            key: String(p),
            value: Reflect.get(t, p),
          };
          clients.forEach((c) => c.send(pack));
        }
      }
    },
  }) as any as T & { [Handle](soc: WebSocket): void };

  return proxy;
}

createEntangleServer.Handle = Handle;
