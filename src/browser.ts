import createAdaptor, { Entangled, Connect, Disconnect } from "./adaptor.js";
import type { EntangledObject } from "./types.js";

export default function createEntangle<
  T extends object,
  OmittedKeys extends Array<keyof T> | undefined = undefined,
  PickedKeys extends Array<keyof T> | undefined = undefined
>(
  address: string,
  protocols?: string | string[]
): EntangledObject<T, OmittedKeys, PickedKeys> {
  return createAdaptor<T, OmittedKeys, PickedKeys>((onopen, onmessage) => {
    const constructor = () => {
      const ws = new WebSocket(address, protocols);

      ws.addEventListener("open", onopen);

      ws.addEventListener("message", ({ data }) => {
        if (data instanceof Uint8Array) onmessage(data);
        else if (data instanceof ArrayBuffer) onmessage(new Uint8Array(data));
        else throw new Error("Invalid Type");
      });

      ws.addEventListener("close", () => {
        if (entangled) websocket = constructor();
      });

      return ws;
    };

    let entangled = true;
    let websocket = constructor();

    const connect = () => {
      if (entangled) return;
      entangled = true;
      websocket = constructor();
    };

    const disconnect = () => {
      if (!entangled) return;
      entangled = false;
      websocket.close();
    };

    return {
      send: (data: Uint8Array) => websocket.send(data),
      connect,
      disconnect,
      isEntangled: () => entangled,
    };
  });
}

createEntangle.Entangled = Entangled;
createEntangle.Connect = Connect;
createEntangle.Disconnect = Disconnect;
