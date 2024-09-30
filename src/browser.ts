import Client, { EntangleAdaptor } from "./client.js";
import type { ShuttleOptions } from "./types.js";

export default function createEntangle(
  address: string,
  protocols?: string | string[],
  shuttleOptions?: ShuttleOptions
) {
  return new Client(
    new EntangleAdaptor((emitter) => {
      const ws = new WebSocket(address, protocols);

      ws.addEventListener("open", () => emitter.emit("connect"));

      ws.addEventListener("message", async ({ data: rawData }) => {
        const data =
          rawData instanceof Uint8Array
            ? rawData
            : rawData instanceof ArrayBuffer
            ? new Uint8Array(rawData)
            : rawData instanceof Blob
            ? new Uint8Array(await rawData.arrayBuffer())
            : null;
        if (data === null) throw new Error(`Invalid Type ${rawData}`);
        emitter.emit("message", data);
      });

      ws.addEventListener("close", () => emitter.emit("disconnect"));

      return ws;
    }),
    shuttleOptions
  );
}
