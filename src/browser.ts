import createClientAdaptor from "./adaptor.js";

export default function createEntangle<
  T extends object,
  O extends Array<keyof T> | undefined = undefined,
  P extends Array<keyof T> | undefined = undefined
>(address: string, protocols?: string | string[]) {
  return createClientAdaptor<T, O, P>((onopen, onmessage) => {
    const constructor = () => {
      const ws = new WebSocket(address, protocols);

      ws.addEventListener("open", onopen);

      ws.addEventListener("message", ({ data }) => {
        if (data instanceof Uint8Array) onmessage(data);
        else if (data instanceof ArrayBuffer) onmessage(new Uint8Array(data));
        else throw new Error("Invalid Type");
      });

      ws.addEventListener("close", () => {
        websocket = constructor();
      });

      return ws;
    };

    let websocket = constructor();

    return (data: Uint8Array) => websocket.send(data);
  });
}
