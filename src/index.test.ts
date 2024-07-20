import { WebSocketServer } from "ws";
import createEntangleServer from "./server.js";
import createEntangle from "./node.js";

const server = new WebSocketServer({ port: 4000 });

type Auth = {
  appName: string;
  count: number;
  login(
    name: string,
    pass: number
  ): Promise<{
    success: boolean;
    name: string;
    pass: number;
  }>;
  throwing(): Promise<never>;
};

const auth = createEntangleServer<Auth>(
  {
    appName: "Twitter",
    count: 123,
    async login(name: string, pass: number) {
      return { success: true, name, pass };
    },
    async throwing() {
      throw new Error("Always Error");
    },
  },
  {
    omittedKeys: ["count"],
  }
);

server.on("connection", (soc) => {
  auth[createEntangleServer.Handle](soc);
  setTimeout(() => {
    soc.close();
    auth.appName = "Reddit";
  }, 700);
});

(async () => {
  const client = createEntangle<Auth, ["count"]>("ws://localhost:4000");
  setTimeout(async () => {
    console.log(client.appName);
    console.log(await client.login("Alex", 8));
  }, 100);
  setTimeout(async () => {
    client.appName = "X";
  }, 200);
  setTimeout(async () => {
    console.log(client.appName, auth.appName);
  }, 300);
  setTimeout(async () => {
    client.appName = "Threads";
  }, 400);
  setTimeout(async () => {
    console.log(auth.appName);
    auth.login = async (name: string, pass: number) => ({
      success: false,
      name,
      pass,
    });
  }, 500);
  setTimeout(async () => {
    console.log(await client.login("Bob", 9));
    console.log(client.login.toString());
  }, 600);
  setTimeout(async () => {
    console.log(await client.login("Jack", 12));
    console.log(client);
  }, 800);
})();
