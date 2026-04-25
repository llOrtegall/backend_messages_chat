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

async function registerUser(email: string) {
  const res = await server.post("/api/v1/auth/register", {
    email,
    password: "password123",
    displayName: "User",
  });
  return res.json() as Promise<{ accessToken: string; user: { id: string } }>;
}

describe("Attachments — presign", () => {
  test("returns upload URL, key and publicUrl", async () => {
    const { accessToken } = await registerUser("a@x.com");
    const res = await server.post("/api/v1/attachments/presign", {
      contentType: "image/png",
      sizeBytes: 1024,
    }, accessToken);

    expect(res.status).toBe(201);
    const body = await res.json() as { url: string; key: string; publicUrl: string; expiresAt: string };
    expect(body.url).toBeTruthy();
    expect(body.key).toMatch(/^uploads\//);
    expect(body.publicUrl).toBeTruthy();
    expect(body.expiresAt).toBeTruthy();
  });

  test("key extension matches content type", async () => {
    const { accessToken } = await registerUser("b@x.com");
    const res = await server.post("/api/v1/attachments/presign", {
      contentType: "video/mp4",
      sizeBytes: 1024 * 1024,
    }, accessToken);

    const { key } = await res.json() as { key: string };
    expect(key).toMatch(/\.mp4$/);
  });

  test("requires authentication", async () => {
    const res = await server.post("/api/v1/attachments/presign", {
      contentType: "image/png",
      sizeBytes: 512,
    });
    expect(res.status).toBe(401);
  });
});

describe("Attachments — confirm", () => {
  test("returns 404 for key that was not uploaded", async () => {
    const { accessToken } = await registerUser("c@x.com");
    const presignRes = await server.post("/api/v1/attachments/presign", {
      contentType: "image/jpeg",
      sizeBytes: 512,
    }, accessToken);
    const { key } = await presignRes.json() as { key: string };

    const confirmRes = await server.get(`/api/v1/attachments/confirm?key=${key}`, accessToken);
    expect(confirmRes.status).toBe(404);
  });

  test("returns 200 with publicUrl after simulated upload", async () => {
    const { accessToken } = await registerUser("d@x.com");
    const presignRes = await server.post("/api/v1/attachments/presign", {
      contentType: "image/png",
      sizeBytes: 2048,
    }, accessToken);
    const { key } = await presignRes.json() as { key: string };

    server.objectStorage.simulateUpload(key);

    const confirmRes = await server.get(`/api/v1/attachments/confirm?key=${key}`, accessToken);
    expect(confirmRes.status).toBe(200);
    const { publicUrl } = await confirmRes.json() as { publicUrl: string };
    expect(publicUrl).toContain(key);
  });
});

describe("Attachments — send message with attachment", () => {
  test("message with valid attachment key is accepted", async () => {
    const alice = await registerUser("alice@x.com");
    const bob = await registerUser("bob@x.com");

    const roomRes = await server.post("/api/v1/rooms", { targetUserId: bob.user.id }, alice.accessToken);
    const { room } = await roomRes.json() as { room: { id: string } };

    const presignRes = await server.post("/api/v1/attachments/presign", {
      contentType: "image/png",
      sizeBytes: 2048,
    }, alice.accessToken);
    const { key } = await presignRes.json() as { key: string };

    server.objectStorage.simulateUpload(key);

    const msgRes = await server.post(`/api/v1/rooms/${room.id}/messages`, {
      body: "",
      attachmentKey: key,
    }, alice.accessToken);

    expect(msgRes.status).toBe(201);
    const { message } = await msgRes.json() as { message: { attachmentKey: string } };
    expect(message.attachmentKey).toBe(key);
  });

  test("message with attachment key not yet uploaded is rejected with 409", async () => {
    const alice = await registerUser("alice@x.com");
    const bob = await registerUser("bob@x.com");

    const roomRes = await server.post("/api/v1/rooms", { targetUserId: bob.user.id }, alice.accessToken);
    const { room } = await roomRes.json() as { room: { id: string } };

    const res = await server.post(`/api/v1/rooms/${room.id}/messages`, {
      body: "",
      attachmentKey: "uploads/ghost-file.png",
    }, alice.accessToken);

    expect(res.status).toBe(409);
  });
});
