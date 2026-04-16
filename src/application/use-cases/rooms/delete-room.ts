import type { RoomRepository } from "../../../domain/ports/repositories/room-repository.ts";
import { RoomAuthorizer } from "../../services/room-authorizer.ts";

interface Deps {
  roomRepo: RoomRepository;
  authorizer: RoomAuthorizer;
}

export class DeleteRoom {
  constructor(private readonly deps: Deps) {}

  async execute(requesterId: string, roomId: string): Promise<void> {
    const room = await this.deps.authorizer.assertRoomExists(roomId);

    if (room.kind === "group") {
      await this.deps.authorizer.assertOwner(roomId, requesterId);
    } else {
      // DM: cualquier miembro puede eliminar
      await this.deps.authorizer.assertMember(roomId, requesterId);
    }

    await this.deps.roomRepo.deleteRoom(roomId);
  }
}
