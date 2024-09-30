import { WebSocketServer } from "ws";
import Server from "./server.js";
import createEntangle from "./node.js";
import { omit, OmitKeys, pick } from "@cch137/xbject";

const server = new WebSocketServer({ port: 4000 });

type ServerData = {
  persons: { name: string; age: number }[];
  luckyNumber: number;
  adminKey: string;
  sayHi(): void;
};

const serverData: ServerData = {
  persons: [
    { name: "Alice", age: 30 },
    { name: "Bob", age: 25 },
    { name: "Charlie", age: 35 },
  ],
  luckyNumber: 7,
  adminKey: "12345678",
  sayHi() {
    console.log("Server say: Hi");
    return { ok: true };
  },
};

const eServer = new Server({
  salts: [8881],
  md5: true,
});

eServer.register("data1", serverData, () => omit(serverData, ["adminKey"]));

server.on("connection", (soc) => {
  eServer.handle(soc);
});

(async () => {
  const eClient = createEntangle("ws://localhost:4000", void 0, {
    salts: [8881],
    md5: true,
  });
  eClient.subscribe("data1");
  const service =
    eClient.getService<OmitKeys<ServerData, ["adminKey"]>>("data1");
  if (!service) return;
  service.once("ready", async () => {
    console.log("once ready", await service.target.sayHi());
  });
})();
