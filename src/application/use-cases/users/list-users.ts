import type { UserRepository } from "../../../domain/ports/repositories/user-repository.ts";
import type { PresenceStore } from "../../../domain/ports/services/presence-store.ts";
import { toPublicUser, type PublicUser } from "../../../domain/entities/user.ts";

export interface UserWithPresence extends PublicUser {
  isOnline: boolean;
}

interface Deps {
  userRepo: UserRepository;
  presenceStore: PresenceStore;
}

export class ListUsers {
  constructor(private readonly deps: Deps) {}

  async execute(requesterId: string): Promise<UserWithPresence[]> {
    const users = await this.deps.userRepo.listAll(requesterId);
    const ids = users.map((u) => u.id);
    const onlineIds = new Set(await this.deps.presenceStore.listOnline(ids));
    return users.map((u) => ({ ...toPublicUser(u), isOnline: onlineIds.has(u.id) }));
  }
}
