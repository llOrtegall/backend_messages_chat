import { buildApp } from "../../src/composition-root.ts";
import { createServer } from "../../src/create-server.ts";
import { migrate } from "../../src/infrastructure/db/migrator.ts";
import { sql } from "../../src/infrastructure/db/client.ts";

export async function startTestServer() {
  await migrate();
  const ctx = buildApp();
  const server = createServer(ctx, 0);
  const base = `http://localhost:${server.port}`;
  const wsBase = `ws://localhost:${server.port}`;

  async function post(path: string, body: unknown, token?: string) {
    return fetch(`${base}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
  }

  async function get(path: string, token?: string) {
    return fetch(`${base}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  }

  async function patch(path: string, body: unknown, token: string) {
    return fetch(`${base}${path}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  }

  async function del(path: string, token: string) {
    return fetch(`${base}${path}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  return { server, base, wsBase, post, get, patch, del };
}

export async function truncateTables() {
  await sql`
    TRUNCATE users, rooms, messages, room_members, refresh_tokens, email_tokens
    RESTART IDENTITY CASCADE
  `;
}

export async function registerAndLogin(
  post: (path: string, body: unknown, token?: string) => Promise<Response>,
  email = "test@example.com",
  password = "password123",
  displayName = "Test User",
) {
  const regRes = await post("/api/v1/auth/register", { email, password, displayName });
  const { accessToken } = await regRes.json() as { accessToken: string; user: { id: string } };
  return accessToken;
}
