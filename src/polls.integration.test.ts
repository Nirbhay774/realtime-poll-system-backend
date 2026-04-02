import type { AddressInfo } from "net";

import mongoose from "mongoose";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import WebSocket from "ws";

import { connectToDatabase } from "./config/db";
import { createHttpServer } from "./serverFactory";

let mongoServer: MongoMemoryServer;
let server: ReturnType<typeof createHttpServer>;
let baseUrl: string;

function waitForSocketOpen(socket: WebSocket) {
  return new Promise<void>((resolve, reject) => {
    socket.once("open", () => resolve());
    socket.once("error", reject);
  });
}

function waitForMessage<T>(socket: WebSocket, eventType: string) {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for ${eventType}`));
    }, 5000);

    socket.on("message", function handleMessage(rawData) {
      const message = JSON.parse(rawData.toString()) as {
        type: string;
        payload: T;
      };

      if (message.type !== eventType) {
        return;
      }

      clearTimeout(timeout);
      socket.off("message", handleMessage);
      resolve(message.payload);
    });
  });
}

describe("poll voting flow", () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongoServer.getUri();
    await connectToDatabase();

    server = createHttpServer();

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        resolve();
      });
    });

    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    const collections = mongoose.connection.collections;

    await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  });

  it("creates a poll with totalVotes and timestamps", async () => {
    const response = await request(baseUrl).post("/polls").send({
      question: "What should we ship next?",
      description: "Choose one option",
      options: ["Realtime updates", "Share links"],
    });

    expect(response.status).toBe(201);
    expect(response.body.totalVotes).toBe(0);
    expect(response.body.updatedAt).toEqual(expect.any(String));
    expect(response.body.options).toHaveLength(2);
  });

  it("allows one vote per voterToken and rejects repeats", async () => {
    const createResponse = await request(baseUrl).post("/polls").send({
      question: "Pick a transport",
      description: "",
      options: ["Train", "Flight"],
    });

    const pollId = createResponse.body.id as string;
    const optionId = createResponse.body.options[0].id as string;

    const firstVote = await request(baseUrl).post(`/polls/${pollId}/vote`).send({
      optionId,
      voterToken: "browser-a",
    });

    expect(firstVote.status).toBe(200);
    expect(firstVote.body.totalVotes).toBe(1);
    expect(firstVote.body.hasVoted).toBe(true);

    const duplicateVote = await request(baseUrl).post(`/polls/${pollId}/vote`).send({
      optionId,
      voterToken: "browser-a",
    });

    expect(duplicateVote.status).toBe(409);
    expect(duplicateVote.body.message).toContain("already voted");

    const secondBrowserVote = await request(baseUrl).post(`/polls/${pollId}/vote`).send({
      optionId,
      voterToken: "browser-b",
    });

    expect(secondBrowserVote.status).toBe(200);
    expect(secondBrowserVote.body.totalVotes).toBe(2);
  });

  it("returns hasVoted on fetch when the browser already voted", async () => {
    const createResponse = await request(baseUrl).post("/polls").send({
      question: "Choose a stack",
      description: "",
      options: ["Next.js", "Express"],
    });

    const pollId = createResponse.body.id as string;
    const optionId = createResponse.body.options[0].id as string;

    await request(baseUrl).post(`/polls/${pollId}/vote`).send({
      optionId,
      voterToken: "browser-a",
    });

    const getResponse = await request(baseUrl)
      .get(`/polls/${pollId}`)
      .set("x-voter-token", "browser-a");

    expect(getResponse.status).toBe(200);
    expect(getResponse.body.hasVoted).toBe(true);
    expect(getResponse.body.totalVotes).toBe(1);
  });

  it("broadcasts poll and list updates over WebSocket after a vote", async () => {
    const createResponse = await request(baseUrl).post("/polls").send({
      question: "Best feature?",
      description: "",
      options: ["Share", "Realtime"],
    });

    const pollId = createResponse.body.id as string;
    const optionId = createResponse.body.options[0].id as string;

    const pollSocket = new WebSocket(baseUrl.replace("http", "ws") + "/ws");
    const listSocket = new WebSocket(baseUrl.replace("http", "ws") + "/ws");

    await Promise.all([waitForSocketOpen(pollSocket), waitForSocketOpen(listSocket)]);

    pollSocket.send(JSON.stringify({ type: "subscribe", channel: `poll:${pollId}` }));
    listSocket.send(JSON.stringify({ type: "subscribe", channel: "poll-list" }));

    const pollMessagePromise = waitForMessage<{ id: string; totalVotes: number }>(pollSocket, "poll.updated");
    const listMessagePromise = waitForMessage<{ id: string; totalVotes: number }>(listSocket, "poll-list.updated");

    const voteResponse = await request(baseUrl).post(`/polls/${pollId}/vote`).send({
      optionId,
      voterToken: "browser-a",
    });

    expect(voteResponse.status).toBe(200);

    const [pollMessage, listMessage] = await Promise.all([pollMessagePromise, listMessagePromise]);

    expect(pollMessage.id).toBe(pollId);
    expect(pollMessage.totalVotes).toBe(1);
    expect(listMessage.id).toBe(pollId);
    expect(listMessage.totalVotes).toBe(1);

    pollSocket.close();
    listSocket.close();
  });
});
