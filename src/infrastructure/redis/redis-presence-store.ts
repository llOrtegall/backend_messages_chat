import type { PresenceStore } from "../../domain/ports/services/presence-store.ts";

type RedisClient = Bun.RedisClient;

export class RedisPresenceStore implements PresenceStore {
  constructor(private readonly redis: RedisClient) {}

  async markOnline(userId: string, connId: string, ttlSec: number): Promise<void> {
    const key = `presence:${userId}`;
    await this.redis.hset(key, connId, String(Date.now()));
    await this.redis.expire(key, ttlSec);
  }

  async markOffline(userId: string, connId: string): Promise<boolean> {
    const key = `presence:${userId}`;
    const removed = await this.redis.hdel(key, connId);
    return (removed as number) > 0;
  }

  async heartbeat(userId: string, connId: string, ttlSec: number): Promise<void> {
    const key = `presence:${userId}`;
    await this.redis.hset(key, connId, String(Date.now()));
    await this.redis.expire(key, ttlSec);
  }

  async isOnline(userId: string): Promise<boolean> {
    const count = await this.redis.hlen(`presence:${userId}`);
    return count > 0;
  }

  async listOnline(userIds: string[]): Promise<string[]> {
    if (userIds.length === 0) return [];
    const counts = await Promise.all(
      userIds.map(uid => this.redis.hlen(`presence:${uid}`)),
    );
    return userIds.filter((_, i) => (counts[i] as number) > 0);
  }
}
