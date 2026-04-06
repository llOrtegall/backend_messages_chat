import type { Room, RoomMember, RoomRole } from "../../entities/room.ts";

export interface RoomRepository {
  createDm(room: Room, memberA: RoomMember, memberB: RoomMember): Promise<Room>;
  createGroup(room: Room, owner: RoomMember): Promise<Room>;
  findById(id: string): Promise<Room | null>;
  findDmBetween(userA: string, userB: string): Promise<Room | null>;
  listForUser(userId: string): Promise<Room[]>;
  addMember(member: RoomMember): Promise<RoomMember>;
  removeMember(roomId: string, userId: string): Promise<void>;
  getMember(roomId: string, userId: string): Promise<RoomMember | null>;
  listMembers(roomId: string): Promise<RoomMember[]>;
  setLastReadMessage(roomId: string, userId: string, messageId: string): Promise<void>;
  bumpLastMessageAt(roomId: string, at: Date): Promise<void>;
  updateMemberRole(roomId: string, userId: string, role: RoomRole): Promise<void>;
}
