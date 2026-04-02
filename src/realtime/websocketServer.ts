import type { Server as HttpServer } from "http";

import { WebSocketServer, type RawData, type WebSocket } from "ws";

type SocketEvent =
  | {
      type: "poll.updated";
      payload: unknown;
    }
  | {
      type: "poll-list.updated";
      payload: unknown;
    }
  | {
      type: "error";
      payload: {
        message: string;
      };
    };

const channelSubscribers = new Map<string, Set<WebSocket>>();
const socketSubscriptions = new Map<WebSocket, Set<string>>();

function addSubscription(socket: WebSocket, channel: string) {
  if (!channelSubscribers.has(channel)) {
    channelSubscribers.set(channel, new Set());
  }

  channelSubscribers.get(channel)?.add(socket);

  if (!socketSubscriptions.has(socket)) {
    socketSubscriptions.set(socket, new Set());
  }

  socketSubscriptions.get(socket)?.add(channel);
}

function removeSocket(socket: WebSocket) {
  const channels = socketSubscriptions.get(socket);

  if (!channels) {
    return;
  }

  for (const channel of channels) {
    const subscribers = channelSubscribers.get(channel);
    subscribers?.delete(socket);

    if (subscribers?.size === 0) {
      channelSubscribers.delete(channel);
    }
  }

  socketSubscriptions.delete(socket);
}

function sendEvent(socket: WebSocket, event: SocketEvent) {
  if (socket.readyState !== socket.OPEN) {
    return;
  }

  socket.send(JSON.stringify(event));
}

export function attachWebSocketServer(server: HttpServer) {
  const webSocketServer = new WebSocketServer({
    server,
    path: "/ws",
  });

  webSocketServer.on("connection", (socket: WebSocket) => {
    socket.on("message", (message: RawData) => {
      try {
        const data = JSON.parse(message.toString()) as {
          type?: string;
          channel?: string;
        };

        if (data.type !== "subscribe" || typeof data.channel !== "string" || !data.channel) {
          sendEvent(socket, {
            type: "error",
            payload: {
              message: "Invalid subscribe message",
            },
          });
          return;
        }

        addSubscription(socket, data.channel);
      } catch {
        sendEvent(socket, {
          type: "error",
          payload: {
            message: "Invalid message payload",
          },
        });
      }
    });

    socket.on("close", () => {
      removeSocket(socket);
    });

    socket.on("error", () => {
      removeSocket(socket);
    });
  });

  return webSocketServer;
}

export function broadcastToChannel(channel: string, event: SocketEvent) {
  const subscribers = channelSubscribers.get(channel);

  if (!subscribers) {
    return;
  }

  for (const socket of subscribers) {
    sendEvent(socket, event);
  }
}
