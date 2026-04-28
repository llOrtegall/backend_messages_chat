import { describe, test, expect } from "bun:test";
import { MarkUserOffline } from "../../../src/application/use-cases/presence/mark-user-offline.ts";
import { FakePresenceStore, FakeMessageBus } from "../../helpers/fakes.ts";

describe("MarkUserOffline", () => {
  test("marks user offline when last connection closes", async () => {
    const store = new FakePresenceStore();
    const bus = new FakeMessageBus();
    const uc = new MarkUserOffline({ presenceStore: store, bus });

    await store.markOnline("user1", "conn1", 60);
    await uc.execute("user1", "conn1");

    expect(await store.isOnline("user1")).toBe(false);
  });

  test("publishes presence.offline event when user has no more connections", async () => {
    const store = new FakePresenceStore();
    const bus = new FakeMessageBus();
    const uc = new MarkUserOffline({ presenceStore: store, bus });

    await store.markOnline("user1", "conn1", 60);
    await uc.execute("user1", "conn1");

    expect(bus.lastPublished("presence:global")).toMatchObject({ kind: "presence.offline", userId: "user1" });
  });

  test("does NOT publish offline event if user still has other open connections", async () => {
    const store = new FakePresenceStore();
    const bus = new FakeMessageBus();
    const uc = new MarkUserOffline({ presenceStore: store, bus });

    await store.markOnline("user1", "conn1", 60);
    await store.markOnline("user1", "conn2", 60);
    await uc.execute("user1", "conn1");

    expect(await store.isOnline("user1")).toBe(true);
    expect(bus.published.filter(p => p.channel === "presence:global")).toHaveLength(0);
  });

  test("is safe to call for an unknown connection", async () => {
    const store = new FakePresenceStore();
    const bus = new FakeMessageBus();
    const uc = new MarkUserOffline({ presenceStore: store, bus });

    await uc.execute("user1", "conn-ghost");

    expect(await store.isOnline("user1")).toBe(false);
    expect(bus.published).toHaveLength(0);
  });

  test("listOnline excludes users with no connections", async () => {
    const store = new FakePresenceStore();
    const bus = new FakeMessageBus();
    const uc = new MarkUserOffline({ presenceStore: store, bus });

    await store.markOnline("user1", "conn1", 60);
    await store.markOnline("user2", "conn2", 60);
    await uc.execute("user1", "conn1");

    const online = await store.listOnline(["user1", "user2"]);
    expect(online).not.toContain("user1");
    expect(online).toContain("user2");
  });
});
