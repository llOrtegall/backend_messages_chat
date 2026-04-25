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

describe("Auth — email verification", () => {
  test("confirms email with valid token", async () => {
    const reg = await server.post("/api/v1/auth/register", {
      email: "verify@example.com",
      password: "password123",
      displayName: "Verify",
    });
    const { accessToken } = await reg.json() as { accessToken: string };

    // Clear emails from register's fire-and-forget verification
    server.emailSender.sent = [];

    const reqRes = await server.post("/api/v1/auth/verify-email/request", {}, accessToken);
    expect(reqRes.status).toBe(204);

    const link = server.emailSender.sent[0]?.link ?? "";
    expect(link).toBeTruthy();
    const token = new URL(link).searchParams.get("token")!;

    const confirmRes = await server.post("/api/v1/auth/verify-email/confirm", { token });
    expect(confirmRes.status).toBe(204);

    const meRes = await server.get("/api/v1/auth/me", accessToken);
    const { user } = await meRes.json() as { user: { emailVerifiedAt: string | null } };
    expect(user.emailVerifiedAt).not.toBeNull();
  });

  test("invalid verification token returns 401", async () => {
    const res = await server.post("/api/v1/auth/verify-email/confirm", { token: "bad-token" });
    expect(res.status).toBe(401);
  });

  test("request is idempotent for already-verified user", async () => {
    const reg = await server.post("/api/v1/auth/register", {
      email: "verified2@example.com",
      password: "password123",
      displayName: "V2",
    });
    const { accessToken } = await reg.json() as { accessToken: string };

    server.emailSender.sent = [];
    await server.post("/api/v1/auth/verify-email/request", {}, accessToken);
    const token = new URL(server.emailSender.sent[0]?.link ?? "").searchParams.get("token")!;
    await server.post("/api/v1/auth/verify-email/confirm", { token });

    // Second request on already-verified user should be a no-op (204, no email sent)
    server.emailSender.sent = [];
    const r = await server.post("/api/v1/auth/verify-email/request", {}, accessToken);
    expect(r.status).toBe(204);
    expect(server.emailSender.sent.length).toBe(0);
  });
});

describe("Auth — password reset", () => {
  test("full reset flow", async () => {
    await server.post("/api/v1/auth/register", {
      email: "reset@example.com",
      password: "oldpassword",
      displayName: "Reset",
    });

    const reqRes = await server.post("/api/v1/auth/password-reset/request", {
      email: "reset@example.com",
    });
    expect(reqRes.status).toBe(204);

    const link = server.emailSender.sent.find(e => e.kind === "reset")?.link;
    expect(link).toBeTruthy();
    const token = new URL(link!).searchParams.get("token")!;

    const confirmRes = await server.post("/api/v1/auth/password-reset/confirm", {
      token,
      newPassword: "newpassword123",
    });
    expect(confirmRes.status).toBe(204);

    // Old password must fail
    const oldLogin = await server.post("/api/v1/auth/login", {
      email: "reset@example.com",
      password: "oldpassword",
    });
    expect(oldLogin.status).toBe(401);

    // New password must work
    const newLogin = await server.post("/api/v1/auth/login", {
      email: "reset@example.com",
      password: "newpassword123",
    });
    expect(newLogin.status).toBe(200);
  });

  test("unknown email returns 204 without leak", async () => {
    const res = await server.post("/api/v1/auth/password-reset/request", {
      email: "nobody@example.com",
    });
    expect(res.status).toBe(204);
  });

  test("invalid reset token returns 401", async () => {
    const res = await server.post("/api/v1/auth/password-reset/confirm", {
      token: "bad-token",
      newPassword: "newpassword123",
    });
    expect(res.status).toBe(401);
  });

  test("token is single-use", async () => {
    await server.post("/api/v1/auth/register", {
      email: "singleuse@example.com",
      password: "oldpassword",
      displayName: "S",
    });
    await server.post("/api/v1/auth/password-reset/request", { email: "singleuse@example.com" });

    const link = server.emailSender.sent.find(e => e.kind === "reset")?.link;
    const token = new URL(link!).searchParams.get("token")!;

    await server.post("/api/v1/auth/password-reset/confirm", { token, newPassword: "newpassword1" });

    // Second use of same token should fail
    const res = await server.post("/api/v1/auth/password-reset/confirm", {
      token,
      newPassword: "newpassword2",
    });
    expect(res.status).toBe(401);
  });
});
