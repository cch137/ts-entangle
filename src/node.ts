import type { ClientRequestArgs } from "http";
import { WebSocket, type ClientOptions } from "ws";
import Client, { EntangleAdaptor } from "./client.js";
import type { ShuttleOptions } from "./types.js";

export default function createEntangle(
  address: string,
  wsOptions?: ClientOptions | ClientRequestArgs,
  shuttleOptions?: ShuttleOptions
) {
  return new Client(
    new EntangleAdaptor((emitter) => {
      const ws = new WebSocket(address, wsOptions);

      ws.on("open", () => emitter.emit("connect"));

      ws.on("message", (rawData) => {
        const data =
          rawData instanceof Buffer
            ? Uint8Array.from(rawData)
            : rawData instanceof Uint8Array
            ? rawData
            : rawData instanceof ArrayBuffer
            ? new Uint8Array(rawData)
            : Array.isArray(rawData)
            ? Uint8Array.from(
                Buffer.concat(rawData.map((i) => Uint8Array.from(i)))
              )
            : null;
        if (data === null) throw new Error(`Invalid Type ${rawData}`);
        emitter.emit("message", data);
      });

      ws.on("close", () => emitter.emit("disconnect"));

      return ws;
    }),
    shuttleOptions
  );
}
