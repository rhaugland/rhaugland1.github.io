import { createServer } from "node:http";
import { parse } from "node:url";
import next from "next";
import { attachWebSocketServer } from "./src/lib/ws-server";

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = parseInt(process.env.PORT ?? "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url ?? "/", true);
    handle(req, res, parsedUrl);
  });

  attachWebSocketServer(server);

  server.listen(port, () => {
    console.log(`> slushie web ready on http://${hostname}:${port}`);
    console.log(`> websocket audio endpoint: ws://${hostname}:${port}/ws/audio`);
  });
});
