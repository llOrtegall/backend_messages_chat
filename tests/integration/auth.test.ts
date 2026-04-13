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

describe("Auth — register", () => {
  test("returns user + tokens on success", async () => {
    const res = await server.post("/api/v1/auth/register", {
      email: "alice@example.com",
      password: "password123",
      displayName: "Alice",
    });
    expect(res.status).toBe(201);
    const body = await res.json() as Record<string, unknown>;
    expect((body.user as Record<string, unknown>).email).toBe("alice@example.com");
    expect(typeof body.accessToken).toBe("string");
    expect(typeof body.refreshToken).toBe("string");
  });

  test("409 on duplicate email", async () => {
    await server.post("/api/v1/auth/register", { email: "alice@example.com", password: "password123", displayName: "A" });
    const res = await server.post("/api/v1/auth/register", { email: "alice@example.com", password: "password456", displayName: "A2" });
    expect(res.status).toBe(409);
  });

  test("400 on invalid payload", async () => {
    const res = await server.post("/api/v1/auth/register", { email: "not-an-email", password: "pw" });
    expect(res.status).toBe(400);
  });
});

describe("Auth — login", () => {
  test("returns tokens on correct credentials", async () => {
    await server.post("/api/v1/auth/register", { email: "bob@example.com", password: "password123", displayName: "Bob" });
    const res = await server.post("/api/v1/auth/login", { email: "bob@example.com", password: "password123" });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(typeof body.accessToken).toBe("string");
  });

  test("401 on wrong password", async () => {
    await server.post("/api/v1/auth/register", { email: "bob@example.com", password: "password123", displayName: "Bob" });
    const res = await server.post("/api/v1/auth/login", { email: "bob@example.com", password: "wrong" });
    expect(res.status).toBe(401);
  });
});

describe("Auth — refresh + me + logout", () => {
  test("full auth cycle", async () => {
    const reg = await server.post("/api/v1/auth/register", { email: "carol@example.com", password: "password123", displayName: "Carol" });
    const { accessToken, refreshToken } = await reg.json() as { accessToken: string; refreshToken: string };

    // GET /me
    const meRes = await server.get("/api/v1/auth/me", accessToken);
    expect(meRes.status).toBe(200);
    const { user } = await meRes.json() as { user: { email: string } };
    expect(user.email).toBe("carol@example.com");

    // Refresh
    const refRes = await server.post("/api/v1/auth/refresh", { refreshToken });
    expect(refRes.status).toBe(200);
    const { refreshToken: newRefresh } = await refRes.json() as { accessToken: string; refreshToken: string };

    // Old refresh is revoked — reuse should be 401
    const reuseRes = await server.post("/api/v1/auth/refresh", { refreshToken });
    expect(reuseRes.status).toBe(401);

    // Logout
    const logoutRes = await server.post("/api/v1/auth/logout", { refreshToken: newRefresh }, accessToken);
    expect(logoutRes.status).toBe(204);
  });
});
