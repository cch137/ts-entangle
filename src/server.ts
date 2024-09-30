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
      this.services.length = 0;
      this.server.clients.delete(this);
    });

    socket.on("message", async (rawData) => {
      const data =
        rawData instanceof Buffer
          ? new Uint8Array(rawData)
          : Array.isArray(rawData)
          ? Buffer.concat(rawData.map((i) => Uint8Array.from(i)))
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

  subscribe(serviceId: string) {
    const service = this.server.services.get(serviceId);
    if (!service) return;

    service.clients.add(this);
    if (!this.services.includes(service)) this.services.push(service);

    const keys = getAllKeys(service.target);
    keys.forEach((key) => {
      if (typeof key === "string") this.syncKey(service, serviceId, key);
    });

    this.send({ s: serviceId, o: "Y" });
  }

  unsubscribe(serviceId: string) {
    const service = this.server.services.get(serviceId);
    if (service) {
      service.clients.delete(this);
      const index = this.services.indexOf(service);
      if (index !== -1) this.services.splice(index, 1);
    }
  }

  private syncKey(
    service: Service,
    serviceId: string,
    key: string,
    i?: string
  ) {
    const { target } = service;
    if (key in target) {
      const value = (target as any)[key];
      if (typeof value === "function") {
        this.send({ s: serviceId, o: "F", k: key, i });
      } else {
        this.send({ s: serviceId, o: "W", k: key, v: value, i });
      }
    } else {
      this.send({ s: serviceId, o: "D", k: key, i });
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
    this.clients.forEach((client) => {
      try {
        client.send(res);
      } catch (e) {
        client.send({
          s: res.s,
          o: "E",
          m: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
        });
        client.socket.close();
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
      set: (target, property, value) => {
        const result = Reflect.set(target, property, value);
        if (property in target) {
          const resValue = (target as any)[property];
          this.services.get(id)?.broadcast({
            s: id,
            o: typeof resValue === "function" ? "F" : "W",
            k: String(property),
            v: resValue,
          });
        }
        return result;
      },
      deleteProperty: (target, property) => {
        const exists = property in target;
        const result = Reflect.deleteProperty(target, property);
        if (exists) {
          this.services.get(id)?.broadcast({
            s: id,
            o: "D",
            k: String(property),
          });
        }
        return result;
      },
    });

    const target = compute ? compute(proxy) : proxy;
    const service = new Service(target);
    this.services.set(id, service);
    return proxy;
  }

  unregister(id: string) {
    return this.services.delete(id);
  }
}
