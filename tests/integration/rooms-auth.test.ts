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
    displayName: email.split("@")[0],
  });
  return res.json() as Promise<{ accessToken: string; user: { id: string } }>;
}

async function createGroup(ownerToken: string, memberIds: string[] = []) {
  const res = await server.post("/api/v1/rooms", {
    name: "Test Group",
    memberIds,
  }, ownerToken);
  return (await res.json() as { room: { id: string } }).room;
}

describe("Rooms — add member authorization", () => {
  test("member cannot add another member", async () => {
    const owner = await registerUser("owner@x.com");
    const member = await registerUser("member@x.com");
    const outsider = await registerUser("outsider@x.com");

    const room = await createGroup(owner.accessToken, [member.user.id]);

    const res = await server.post(`/api/v1/rooms/${room.id}/members`, {
      userId: outsider.user.id,
      role: "member",
    }, member.accessToken);

    expect(res.status).toBe(403);
  });

  test("owner can add a member", async () => {
    const owner = await registerUser("owner@x.com");
    const newMember = await registerUser("new@x.com");

    const room = await createGroup(owner.accessToken);

    const res = await server.post(`/api/v1/rooms/${room.id}/members`, {
      userId: newMember.user.id,
      role: "member",
    }, owner.accessToken);

    expect(res.status).toBe(201);
  });

  test("admin can add a member", async () => {
    const owner = await registerUser("owner@x.com");
    const admin = await registerUser("admin@x.com");
    const newMember = await registerUser("new@x.com");

    const room = await createGroup(owner.accessToken);

    await server.post(`/api/v1/rooms/${room.id}/members`, {
      userId: admin.user.id,
      role: "admin",
    }, owner.accessToken);

    const res = await server.post(`/api/v1/rooms/${room.id}/members`, {
      userId: newMember.user.id,
      role: "member",
    }, admin.accessToken);

    expect(res.status).toBe(201);
  });

  test("non-member cannot add members", async () => {
    const owner = await registerUser("owner@x.com");
    const outsider = await registerUser("outsider@x.com");
    const target = await registerUser("target@x.com");

    const room = await createGroup(owner.accessToken);

    const res = await server.post(`/api/v1/rooms/${room.id}/members`, {
      userId: target.user.id,
      role: "member",
    }, outsider.accessToken);

    expect(res.status).toBe(403);
  });
});

describe("Rooms — remove member authorization", () => {
  test("member cannot remove another member", async () => {
    const owner = await registerUser("owner@x.com");
    const member1 = await registerUser("m1@x.com");
    const member2 = await registerUser("m2@x.com");

    const room = await createGroup(owner.accessToken, [member1.user.id, member2.user.id]);

    const res = await server.del(`/api/v1/rooms/${room.id}/members`, member1.accessToken, {
      userId: member2.user.id,
    });

    expect(res.status).toBe(403);
  });

  test("admin can remove a member", async () => {
    const owner = await registerUser("owner@x.com");
    const admin = await registerUser("admin@x.com");
    const member = await registerUser("member@x.com");

    const room = await createGroup(owner.accessToken, [member.user.id]);
    await server.post(`/api/v1/rooms/${room.id}/members`, {
      userId: admin.user.id,
      role: "admin",
    }, owner.accessToken);

    const res = await server.del(`/api/v1/rooms/${room.id}/members`, admin.accessToken, {
      userId: member.user.id,
    });

    expect(res.status).toBe(204);
  });

  test("admin cannot remove another admin", async () => {
    const owner = await registerUser("owner@x.com");
    const admin1 = await registerUser("admin1@x.com");
    const admin2 = await registerUser("admin2@x.com");

    const room = await createGroup(owner.accessToken);
    await server.post(`/api/v1/rooms/${room.id}/members`, { userId: admin1.user.id, role: "admin" }, owner.accessToken);
    await server.post(`/api/v1/rooms/${room.id}/members`, { userId: admin2.user.id, role: "admin" }, owner.accessToken);

    const res = await server.del(`/api/v1/rooms/${room.id}/members`, admin1.accessToken, {
      userId: admin2.user.id,
    });

    expect(res.status).toBe(403);
  });

  test("cannot remove the owner", async () => {
    const owner = await registerUser("owner@x.com");
    const admin = await registerUser("admin@x.com");

    const room = await createGroup(owner.accessToken);
    await server.post(`/api/v1/rooms/${room.id}/members`, { userId: admin.user.id, role: "admin" }, owner.accessToken);

    const res = await server.del(`/api/v1/rooms/${room.id}/members`, admin.accessToken, {
      userId: owner.user.id,
    });

    expect(res.status).toBe(403);
  });

  test("member can leave room (remove self)", async () => {
    const owner = await registerUser("owner@x.com");
    const member = await registerUser("member@x.com");

    const room = await createGroup(owner.accessToken, [member.user.id]);

    const res = await server.del(`/api/v1/rooms/${room.id}/members`, member.accessToken, {
      userId: member.user.id,
    });

    expect(res.status).toBe(204);
  });
});
