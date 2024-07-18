import type { ClientRequestArgs } from "http";
import { WebSocket, type ClientOptions } from "ws";
import createClientAdaptor from "./adaptor.js";

export default function createEntangle<
  T extends object,
  O extends Array<keyof T> | undefined = undefined,
  P extends Array<keyof T> | undefined = undefined
>(address: string, options?: ClientOptions | ClientRequestArgs) {
  return createClientAdaptor<T, O, P>((onopen, onmessage) => {
    const constructor = () => {
      const ws = new WebSocket(address, options);

      ws.on("open", onopen);

      ws.on("message", (data) => {
        if (data instanceof Buffer) onmessage(Uint8Array.from(data));
        else if (data instanceof Uint8Array) onmessage(data);
        else if (data instanceof ArrayBuffer) onmessage(new Uint8Array(data));
        else throw new Error("Invalid Type");
      });

      ws.on("close", () => {
        websocket = constructor();
      });

      return ws;
    };

    let websocket = constructor();

    return (data: Uint8Array) => websocket.send(data);
  });
}
