import type { PresenceStore } from "../../../domain/ports/services/presence-store.ts";

export class Heartbeat {
  constructor(private readonly presenceStore: PresenceStore) {}

  async execute(userId: string, connId: string, ttlSec: number): Promise<void> {
    await this.presenceStore.heartbeat(userId, connId, ttlSec);
  }
}
