export type RoomKind = "dm" | "group";
export type RoomRole = "owner" | "admin" | "member";

export interface Room {
  id: string;
  kind: RoomKind;
  name: string | null;
  createdBy: string | null;
  dmKey: string | null;
  lastMessageAt: Date | null;
  createdAt: Date;
}

export interface RoomMember {
  roomId: string;
  userId: string;
  role: RoomRole;
  joinedAt: Date;
  lastReadMessageId: string | null;
  mutedUntil: Date | null;
}
