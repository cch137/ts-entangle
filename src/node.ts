import type { ClientRequestArgs } from "http";
import { WebSocket, type ClientOptions } from "ws";
import type { EntangleOptions, EntangledClient } from "./client.js";
import createEntangleClient, { Adaptor, Ready } from "./client.js";

export default function createEntangle<
  T extends object,
  OmittedKeys extends Array<keyof T> | undefined = undefined,
  PickedKeys extends Array<keyof T> | undefined = undefined,
  ReadonlyKeys extends Array<keyof T> | undefined = undefined
>(
  address: string,
  wsOptions?: ClientOptions | ClientRequestArgs,
  options?: EntangleOptions
): EntangledClient<T, OmittedKeys, PickedKeys, ReadonlyKeys> {
  return createEntangleClient<T, OmittedKeys, PickedKeys, ReadonlyKeys>(
    (emitter) => {
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
            ? Uint8Array.from(Buffer.concat(rawData))
            : null;
        if (data === null) throw new Error(`Invalid Type ${rawData}`);
        emitter.emit("message", data);
      });

      ws.on("close", () => emitter.emit("disconnect"));

      return ws;
    },
    options
  );
}

export { Adaptor, Ready };

createEntangle.Adaptor = Adaptor;
createEntangle.Ready = Ready;
