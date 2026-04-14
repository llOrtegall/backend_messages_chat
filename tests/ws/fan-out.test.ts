import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { startTestServer, truncateTables } from "../helpers/build-app.ts";

let s1: Awaited<ReturnType<typeof startTestServer>>;
let s2: Awaited<ReturnType<typeof startTestServer>>;

beforeAll(async () => {
  // Two instances sharing the same Postgres + Redis
  [s1, s2] = await Promise.all([startTestServer(), startTestServer()]);
});

afterEach(async () => {
  await truncateTables();
});

function wsConnect(wsBase: string, token: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${wsBase}/ws?token=${token}`);
    ws.onopen = () => resolve(ws);
    ws.onerror = reject;
    setTimeout(() => reject(new Error("WS connect timeout")), 3000);
  });
}

function waitForMessage(ws: WebSocket, type: string, timeoutMs = 3000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${type}`)), timeoutMs);
    ws.addEventListener("message", function handler(e) {
      const msg = JSON.parse(e.data as string) as { type: string; payload: unknown };
      if (msg.type === type) {
        clearTimeout(timer);
        ws.removeEventListener("message", handler);
        resolve(msg.payload);
      }
    });
  });
}

function send(ws: WebSocket, envelope: unknown) {
  ws.send(JSON.stringify(envelope));
}

describe("WS — cross-instance fan-out", () => {
  test("message sent on instance 1 is received by subscriber on instance 2", async () => {
    // Register two users on instance 1
    const regA = await s1.post("/api/v1/auth/register", { email: "a@x.com", password: "password123", displayName: "A" });
    const regB = await s1.post("/api/v1/auth/register", { email: "b@x.com", password: "password123", displayName: "B" });
    const { accessToken: tokenA, user: userA } = await regA.json() as { accessToken: string; user: { id: string } };
    const { accessToken: tokenB, user: userB } = await regB.json() as { accessToken: string; user: { id: string } };

    // A creates DM with B
    const roomRes = await s1.post("/api/v1/rooms", { targetUserId: userB.id }, tokenA);
    const { room } = await roomRes.json() as { room: { id: string } };

    // A connects to instance 1, B connects to instance 2
    const wsA = await wsConnect(s1.wsBase, tokenA);
    const wsB = await wsConnect(s2.wsBase, tokenB);

    try {
      // Both subscribe to the room
      const ackA = waitForMessage(wsA, "ack");
      send(wsA, { type: "chat.subscribe", refId: "sub-a", payload: { roomIds: [room.id] } });
      await ackA;

      const ackB = waitForMessage(wsB, "ack");
      send(wsB, { type: "chat.subscribe", refId: "sub-b", payload: { roomIds: [room.id] } });
      await ackB;

      // A sends a message; B should receive message.created
      const bReceives = waitForMessage(wsB, "message.created");
      send(wsA, { type: "chat.send", refId: "send-1", payload: { roomId: room.id, body: "Hey cross-instance!" } });

      const payload = await bReceives as { body: string };
      expect(payload.body).toBe("Hey cross-instance!");
    } finally {
      wsA.close();
      wsB.close();
    }
  });

  test("typing indicator propagates across instances", async () => {
    const regA = await s1.post("/api/v1/auth/register", { email: "c@x.com", password: "password123", displayName: "C" });
    const regB = await s1.post("/api/v1/auth/register", { email: "d@x.com", password: "password123", displayName: "D" });
    const { accessToken: tokenA, user: userA } = await regA.json() as { accessToken: string; user: { id: string } };
    const { accessToken: tokenB, user: userB } = await regB.json() as { accessToken: string; user: { id: string } };

    const roomRes = await s1.post("/api/v1/rooms", { targetUserId: userB.id }, tokenA);
    const { room } = await roomRes.json() as { room: { id: string } };

    const wsA = await wsConnect(s1.wsBase, tokenA);
    const wsB = await wsConnect(s2.wsBase, tokenB);

    try {
      await Promise.all([
        (async () => {
          const ack = waitForMessage(wsA, "ack");
          send(wsA, { type: "chat.subscribe", refId: "sa", payload: { roomIds: [room.id] } });
          await ack;
        })(),
        (async () => {
          const ack = waitForMessage(wsB, "ack");
          send(wsB, { type: "chat.subscribe", refId: "sb", payload: { roomIds: [room.id] } });
          await ack;
        })(),
      ]);

      const bReceivesTyping = waitForMessage(wsB, "user.typing");
      send(wsA, { type: "chat.typing", payload: { roomId: room.id } });

      const typing = await bReceivesTyping as { userId: string };
      expect(typing.userId).toBe(userA.id);
    } finally {
      wsA.close();
      wsB.close();
    }
  });
});
