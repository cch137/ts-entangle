import Emitter, { type ExtractEventMap } from "@cch137/emitter";
import { serialize, parse } from "@cch137/shuttle";
import type {
  AsyncWrappedObject,
  EntangleRequest,
  EntangleResponse,
  ShuttleOptions,
} from "./types.js";
import Id from "./utils/id.js";

type WebSocketLike = {
  send: (data: Uint8Array) => void;
  close: () => void;
  readyState: number;
  OPEN: number;
};

type SocketBuilder = (emitter: AdaptorSocketEmitter) => WebSocketLike;

type AdaptorSocketEmitter = Emitter<{
  connect: [];
  message: [data: Uint8Array];
  disconnect: [];
}>;

export class EntangleAdaptor extends Emitter<
  ExtractEventMap<AdaptorSocketEmitter> & {}
> {
  websocket?: WebSocketLike;

  // controlled by methods
  active: boolean;

  // option: keep properties after disconnected
  cached: boolean;

  builder: SocketBuilder;

  constructor(
    builder: SocketBuilder,
    options?: { active?: boolean; cached?: boolean }
  ) {
    super();
    this.builder = builder;
    this.active = options?.active ?? true;
    this.cached = options?.cached ?? true;
    if (this.active) this.websocket = builder(this);

    // auto reconnect
    this.on("disconnect", () => {
      try {
        this.websocket?.close();
      } catch {}
      this.websocket = undefined;
      if (this.active) this.connect();
    });
  }

  connect() {
    this.active = true;
    if (!this.websocket) this.websocket = this.builder(this);
  }

  disconnect() {
    this.active = false;
    this.websocket?.close();
  }

  send(data: Uint8Array) {
    if (!this.websocket) throw new Error("No websocket connection available");
    if (this.websocket.readyState !== this.websocket.OPEN) {
      this.once("connect", () => this.send(data));
    } else {
      this.websocket.send(data);
    }
  }
}

class Service<T extends object = any> extends Emitter<{
  ready: [];
  change: [key: string, value: any];
  error: [message: string];
  [calledId: `call:${string}`]: [EntangleResponse];
}> {
  readonly id: string;
  client: Client;
  _original = {} as T;
  target: AsyncWrappedObject<T>;
  timeout: number;

  constructor(
    client: Client,
    serviceId: string,
    options?: { timeout?: number }
  ) {
    super();
    this.id = serviceId;
    this.client = client;
    this.timeout = options?.timeout ?? 10000;
    this.target = new Proxy(this._original, {
      set: (t, p, v) => {
        client.send({ o: "W", s: serviceId, k: String(p), v });
        return true;
      },
      deleteProperty: (t, p) => {
        client.send({ o: "D", s: serviceId, k: String(p) });
        return true;
      },
    }) as AsyncWrappedObject<T>;

    const ws = this.client.adaptor.websocket;
    if (ws && ws.readyState === ws.OPEN)
      this.client.send({ o: "S", s: serviceId });
  }

  callFunction<T = any>(name: string, args: any[]) {
    const { adaptor, shuttleOptions } = this.client;
    return new Promise<T>((resolve, reject) => {
      const id = Id.create();
      const eventName: `call:${string}` = `call:${id}`;
      const tOut = setTimeout(() => {
        this.off(eventName, listener);
        reject(new Error("Timeout"));
      }, this.timeout);
      const listener = (data: EntangleResponse) => {
        if (data.o !== "C")
          return reject(new Error(`Operation Error: ${data.o}`));
        clearTimeout(tOut);
        if ("e" in data) {
          reject(new Error(data.e));
        } else {
          resolve(data.v);
        }
      };
      this.once(eventName, listener);
      try {
        adaptor.send(
          serialize(
            {
              o: "C",
              s: this.id,
              i: id,
              k: name,
              a: args,
            } as EntangleRequest,
            shuttleOptions
          )
        );
      } catch (e) {
        reject(e);
        clearTimeout(tOut);
        this.off(eventName, listener);
      }
    });
  }
}

export default class Client {
  readonly adaptor: EntangleAdaptor;
  readonly shuttleOptions?: ShuttleOptions;
  private readonly services = new Map<string, Service>();

  constructor(adaptor: EntangleAdaptor, shuttleOptions?: ShuttleOptions) {
    this.adaptor = adaptor;
    this.shuttleOptions = shuttleOptions;

    adaptor.on("message", (data) => {
      const res = parse<EntangleResponse>(data, shuttleOptions);
      const service = this.services.get(res.s);
      if (!service) return;
      switch (res.o) {
        case "D": {
          Reflect.deleteProperty(service._original, res.k);
          break;
        }
        case "W": {
          Reflect.set(service._original, res.k, res.v);
          break;
        }
        case "F": {
          const key = res.k;
          Reflect.set(service._original, key, (...args: any[]) =>
            service.callFunction(key, args)
          );
          break;
        }
        case "C": {
          service.emit(`call:${res.i}`, res);
          break;
        }
        case "E": {
          service.emit("error", res.m);
          break;
        }
        case "Y": {
          service.emit("ready");
          break;
        }
      }
    });

    adaptor.on("connect", () => {
      this.services.forEach((_, serviceId) => {
        this.send({ o: "S", s: serviceId });
      });
    });
  }

  getService<T extends object = any>(
    serviceId: string
  ): Service<T> | undefined {
    return this.services.get(serviceId);
  }

  subscribe(serviceId: string) {
    if (this.services.has(serviceId))
      throw new Error("Service is already exists");
    this.services.set(serviceId, new Service(this, serviceId));
  }

  unsubscribe(serviceId: string) {
    this.services.delete(serviceId);
    this.send({ o: "U", s: serviceId });
  }

  send(request: EntangleRequest) {
    this.adaptor.send(serialize(request, this.shuttleOptions));
  }
}
