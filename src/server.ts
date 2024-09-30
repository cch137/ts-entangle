import { parse, serialize } from "@cch137/shuttle";
import { getAllKeys } from "@cch137/xbject";
import { WebSocket } from "ws";

import type {
  EntangleRequest,
  EntangleResponse,
  ShuttleOptions,
} from "./types.js";

class Client {
  readonly server: Server;
  readonly services: Service[] = [];
  readonly socket: WebSocket;

  constructor(server: Server, socket: WebSocket) {
    this.server = server;
    this.socket = socket;

    socket.on("close", () => {
      this.services.forEach((s) => s.clients.delete(this));
      this.services.splice(0);
      this.server.clients.delete(this);
    });

    socket.on("message", async (rawData) => {
      const data = Array.isArray(rawData)
        ? Buffer.concat(rawData.map((i) => Uint8Array.from(i)))
        : rawData instanceof Buffer
        ? Uint8Array.from(rawData)
        : new Uint8Array(rawData);

      const req = parse<EntangleRequest>(data, this.server.shuttleOptions);
      const { s: serviceId, o: operation } = req;

      const service = this.server.services.get(serviceId);
      if (!service) return;

      switch (operation) {
        case "S": {
          this.subscribe(serviceId);
          return;
        }
        case "U": {
          this.unsubscribe(serviceId);
          return;
        }
        case "R": {
          this.syncKey(service, serviceId, req.k, req.i);
          return;
        }
        case "C": {
          const f: unknown = (service.target as any)[req.k];
          if (typeof f !== "function") {
            this.send({
              s: serviceId,
              o: "C",
              i: req.i,
              e: "Not a function",
            });
            return;
          }
          try {
            this.send({
              s: serviceId,
              o: "C",
              i: req.i,
              v: await f.apply(service.target, req.a),
            });
          } catch (e) {
            this.send({
              s: serviceId,
              o: "C",
              i: req.i,
              e: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
            });
          }
          return;
        }
        case "D": {
          Reflect.deleteProperty(service.target, req.k);
          return;
        }
        case "W": {
          Reflect.set(service.target, req.k, req.v);
          return;
        }
        default: {
          this.send({
            s: serviceId,
            o: "E",
            m: `Unknown operation: ${String(operation)}`,
          });
        }
      }
    });
  }

  subscribe(serviceId: string): Service | undefined;
  subscribe(service: Service): Service | undefined;
  subscribe(serviceId: string | Service) {
    if (typeof serviceId !== "string") {
      for (const [sid, service] of this.server.services) {
        if (service === serviceId) return this.subscribe(sid);
      }
      return;
    }

    const service = this.server.services.get(serviceId);
    if (!service) return service;

    service.clients.add(this);

    if (service instanceof Server) return service;

    if (!this.services.includes(service)) this.services.push(service);

    const keys = getAllKeys(service.target);
    for (const key of keys) {
      if (typeof key !== "string") continue;
      this.syncKey(service, serviceId, key);
    }

    this.send({
      s: serviceId,
      o: "Y",
    });

    return service;
  }

  unsubscribe(serviceId: string): Service | undefined;
  unsubscribe(service: Service): Service | undefined;
  unsubscribe(service: string | Service) {
    if (typeof service === "string") {
      const service1 = this.server.services.get(service);
      if (service1) return this.unsubscribe(service1);
      return service1;
    }

    service.clients.delete(this);
    const index = this.services.indexOf(service);
    if (index !== -1) this.services.splice(index, 1);

    return service;
  }

  syncKey(service: Service, serviceId: string, key: string, i?: string) {
    const { target } = service;
    if (key in target) {
      const value = (target as any)[key];
      if (typeof value === "function") {
        this.send({
          s: serviceId,
          o: "F",
          k: key,
          i,
        });
      } else {
        this.send({
          s: serviceId,
          o: "W",
          k: key,
          v: value,
          i,
        });
      }
    } else {
      this.send({
        s: serviceId,
        o: "D",
        k: key,
        i,
      });
    }
  }

  send(response: EntangleResponse) {
    this.socket.send(serialize(response, this.server.shuttleOptions));
  }
}

export class Service {
  readonly clients = new Set<Client>();
  target: object;

  constructor(target: object) {
    this.target = target;
  }

  broadcast(res: EntangleResponse) {
    this.clients.forEach(async (c) => {
      try {
        c.send(res);
      } catch (e) {
        c.send({
          s: res.s,
          o: "E",
          m: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
        });
        c.socket.close();
      }
    });
  }
}

export default class Server extends Service {
  readonly services: Map<string, Service>;
  shuttleOptions?: ShuttleOptions;

  constructor(shuttleOptions?: ShuttleOptions) {
    const services = new Map<string, Service>();
    super(services);
    this.services = services;
    this.shuttleOptions = shuttleOptions;
  }

  handle(socket: WebSocket) {
    this.clients.add(new Client(this, socket));
  }

  register<T extends object>(
    id: string,
    original: T,
    compute?: (original: T) => T | Partial<T>
  ) {
    const proxy = new Proxy(original, {
      set: (t, p, v) => {
        const r = Reflect.set(t, p, v);
        if (!(p in target)) return r;
        const value = (target as any)[p];
        if (typeof value === "function") {
          service.broadcast({
            s: id,
            o: "F",
            k: String(p),
          });
        } else {
          service.broadcast({
            s: id,
            o: "W",
            k: String(p),
            v: value,
          });
        }
        return r;
      },
      deleteProperty: (t, p) => {
        const isKey = p in target;
        const r = Reflect.deleteProperty(t, p);
        if (isKey) {
          service.broadcast({
            s: id,
            o: "D",
            k: String(p),
          });
        }
        return r;
      },
    });

    const target = compute ? compute(proxy) : proxy;
    const service = new Service(target);
    this.services.set(id, service);

    return proxy;
  }

  unregister(id: string) {
    const service = this.services.get(id);
    this.services.delete(id);
    return service;
  }
}
