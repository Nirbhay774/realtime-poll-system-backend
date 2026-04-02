import { createServer } from "http";

import app from "./app";
import { attachWebSocketServer } from "./realtime/websocketServer";

export function createHttpServer() {
  const server = createServer(app);
  attachWebSocketServer(server);
  return server;
}
