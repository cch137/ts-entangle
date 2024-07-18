import Shuttle from "@cch137/shuttle";
import { WebSocket } from "ws";
import {
  ClientRequest,
  ServerFunctionReturn,
  ServerResponse,
  ServerSetter,
} from "./types.js";
import { resolveBuffer } from "./utils.js";

function sendResponse(socket: WebSocket, response: ServerResponse) {
  socket.send(Shuttle.serialize(response));
}

const Handle = Symbol("Handle");

export default function createEntangleServer<T extends object>(
  target: T,
  options: { pick?: (keyof T)[]; omit?: (keyof T)[] } = {}
) {
  const sockets = new Set<WebSocket>();
  const { pick, omit } = options;

  const isKey = (key: keyof T) => {
    if (omit && omit.includes(key)) return false;
    if (pick && !pick.includes(key)) return false;
    return true;
  };

  function handleSocket(soc: WebSocket) {
    sockets.add(soc);

    for (const key in target) {
      if (!isKey(key)) continue;

      const value = target[key];
      const func = typeof value === "function";
      if (func)
        sendResponse(soc, {
          op: "set",
          key,
          value: undefined,
          func,
        } as ServerSetter);
      else sendResponse(soc, { op: "set", key, value, func } as ServerSetter);
    }

    soc.on("message", async (data) => {
      const pack = Shuttle.parse<ClientRequest<T>>(resolveBuffer(data));

      switch (pack.op) {
        case "set": {
          const { key, value } = pack;
          if (!isKey(key)) break;
          Reflect.set(target, key, value);
          sendResponse(soc, {
            op: "set",
            func: false,
            key: String(key),
            value,
          } as ServerSetter);
          break;
        }
        case "call": {
          const { uuid, name, args } = pack;
          const func = (target as any)[name];
          if (typeof func !== "function") {
            sendResponse(soc, {
              op: "return",
              uuid,
              error: true,
              message: `"${name}" is not a function`,
            } as ServerFunctionReturn);
            break;
          }
          try {
            sendResponse(soc, {
              op: "return",
              uuid,
              value: await func(...args),
            });
          } catch (e) {
            sendResponse(soc, {
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
      sockets.delete(soc);
    });
  }

  return new Proxy(target, {
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
        if (isKey(p as keyof T)) {
          const pack: ServerSetter =
            typeof v === "function"
              ? { op: "set", func: true, key: String(p), value: undefined }
              : {
                  op: "set",
                  func: false,
                  key: String(p),
                  value: Reflect.get(t, p),
                };
          sockets.forEach((soc) => sendResponse(soc, pack));
        }
      }
    },
    deleteProperty: (t, p) => {
      try {
        return Reflect.deleteProperty(t, p);
      } catch {
        return false;
      } finally {
        if (isKey(p as keyof T)) {
          const pack: ServerSetter = {
            op: "set",
            func: false,
            key: String(p),
            value: Reflect.get(t, p),
          };
          sockets.forEach((soc) => sendResponse(soc, pack));
        }
      }
    },
  }) as any as { [Handle](soc: WebSocket): void } & T;
}

createEntangleServer.Handle = Handle;
