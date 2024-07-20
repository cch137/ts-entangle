import type { EntangleOptions, EntangledClient } from "./adaptor.js";
import createEntangleBase, { Adaptor, Ready } from "./adaptor.js";

export default function createEntangle<
  T extends object,
  OmittedKeys extends Array<keyof T> | undefined = undefined,
  PickedKeys extends Array<keyof T> | undefined = undefined,
  ReadonlyKeys extends Array<keyof T> | undefined = undefined
>(
  address: string,
  protocols?: string | string[],
  options?: EntangleOptions
): EntangledClient<T, OmittedKeys, PickedKeys, ReadonlyKeys> {
  return createEntangleBase<T, OmittedKeys, PickedKeys, ReadonlyKeys>(
    (emitter) => {
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
    },
    options
  );
}

createEntangle.Adaptor = Adaptor;
createEntangle.Ready = Ready;
