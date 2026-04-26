import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { startTestServer, truncateTables } from "../helpers/build-app.ts";

let server: Awaited<ReturnType<typeof startTestServer>>;

beforeAll(async () => {
  server = await startTestServer();
  await truncateTables();
});

afterEach(async () => {
  await truncateTables();
});

async function registerUser(email: string, password = "password123", displayName = "User") {
  const res = await server.post("/api/v1/auth/register", { email, password, displayName });
  return res.json() as Promise<{ accessToken: string; user: { id: string } }>;
}

describe("Rooms", () => {
  test("create DM is idempotent", async () => {
    const a = await registerUser("alice@x.com");
    const b = await registerUser("bob@x.com");

    const r1 = await server.post("/api/v1/rooms", { targetUserId: b.user.id }, a.accessToken);
    const r2 = await server.post("/api/v1/rooms", { targetUserId: b.user.id }, a.accessToken);
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    const { room: room1 } = await r1.json() as { room: { id: string } };
    const { room: room2 } = await r2.json() as { room: { id: string } };
    expect(room1.id).toBe(room2.id);
  });

  test("create group room and list members", async () => {
    const a = await registerUser("alice@x.com");
    const b = await registerUser("bob@x.com");

    const res = await server.post("/api/v1/rooms", { name: "Team", memberIds: [b.user.id] }, a.accessToken);
    expect(res.status).toBe(201);
    const { room } = await res.json() as { room: { id: string; kind: string } };
    expect(room.kind).toBe("group");

    const roomRes = await server.get(`/api/v1/rooms/${room.id}`, a.accessToken);
    const { room: detail } = await roomRes.json() as { room: { members: Array<{ userId: string }> } };
    const userIds = detail.members.map(m => m.userId);
    expect(userIds).toContain(a.user.id);
    expect(userIds).toContain(b.user.id);
  });
});

describe("Messages", () => {
  test("send → list → edit → delete", async () => {
    const a = await registerUser("alice@x.com");
    const b = await registerUser("bob@x.com");

    const roomRes = await server.post("/api/v1/rooms", { targetUserId: b.user.id }, a.accessToken);
    const { room } = await roomRes.json() as { room: { id: string } };

    // Send
    const sendRes = await server.post(`/api/v1/rooms/${room.id}/messages`, { roomId: room.id, body: "Hello!" }, a.accessToken);
    expect(sendRes.status).toBe(201);
    const { message } = await sendRes.json() as { message: { id: string; body: string } };
    expect(message.body).toBe("Hello!");

    // List
    const listRes = await server.get(`/api/v1/rooms/${room.id}/messages`, a.accessToken);
    const { messages } = await listRes.json() as { messages: Array<{ body: string }> };
    expect(messages.some(m => m.body === "Hello!")).toBe(true);

    // Edit
    const editRes = await server.patch(`/api/v1/messages/${message.id}`, { body: "Updated!" }, a.accessToken);
    expect(editRes.status).toBe(200);
    const { message: edited } = await editRes.json() as { message: { body: string; editedAt: string } };
    expect(edited.body).toBe("Updated!");
    expect(edited.editedAt).not.toBeNull();

    // Delete
    const delRes = await server.del(`/api/v1/messages/${message.id}`, a.accessToken);
    expect(delRes.status).toBe(204);
  });

  test("non-member cannot send message", async () => {
    const a = await registerUser("alice@x.com");
    const b = await registerUser("bob@x.com");
    const c = await registerUser("carol@x.com");

    const roomRes = await server.post("/api/v1/rooms", { targetUserId: b.user.id }, a.accessToken);
    const { room } = await roomRes.json() as { room: { id: string } };

    const res = await server.post(`/api/v1/rooms/${room.id}/messages`, { roomId: room.id, body: "Intruder!" }, c.accessToken);
    expect(res.status).toBe(403);
  });

  test("clientMessageId idempotency — same id returned, only one message stored", async () => {
    const a = await registerUser("alice@x.com");
    const b = await registerUser("bob@x.com");

    const roomRes = await server.post("/api/v1/rooms", { targetUserId: b.user.id }, a.accessToken);
    const { room } = await roomRes.json() as { room: { id: string } };

    const payload = { body: "Hello!", clientMessageId: "client-abc-123" };

    const r1 = await server.post(`/api/v1/rooms/${room.id}/messages`, payload, a.accessToken);
    const r2 = await server.post(`/api/v1/rooms/${room.id}/messages`, payload, a.accessToken);

    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);

    const { message: m1 } = await r1.json() as { message: { id: string } };
    const { message: m2 } = await r2.json() as { message: { id: string } };
    expect(m1.id).toBe(m2.id);

    const listRes = await server.get(`/api/v1/rooms/${room.id}/messages`, a.accessToken);
    const { messages } = await listRes.json() as { messages: unknown[] };
    expect(messages).toHaveLength(1);
  });

  test("cursor pagination", async () => {
    const a = await registerUser("alice@x.com");
    const b = await registerUser("bob@x.com");

    const roomRes = await server.post("/api/v1/rooms", { targetUserId: b.user.id }, a.accessToken);
    const { room } = await roomRes.json() as { room: { id: string } };

    // Send 5 messages
    const ids: string[] = [];
    for (let i = 1; i <= 5; i++) {
      const r = await server.post(`/api/v1/rooms/${room.id}/messages`, { roomId: room.id, body: `msg${i}` }, a.accessToken);
      const { message } = await r.json() as { message: { id: string } };
      ids.push(message.id);
    }

    // Get last 2 before the 4th message (IDs are UUIDv7 sortable)
    const listRes = await server.get(`/api/v1/rooms/${room.id}/messages?before=${ids[3]}&limit=2`, a.accessToken);
    const { messages } = await listRes.json() as { messages: Array<{ id: string }> };
    expect(messages.length).toBeLessThanOrEqual(2);
    expect(messages.every(m => m.id < ids[3]!)).toBe(true);
  });
});
