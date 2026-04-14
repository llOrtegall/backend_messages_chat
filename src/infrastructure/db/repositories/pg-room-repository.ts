import type { SQL } from "bun";
import type { RoomRepository } from "../../../domain/ports/repositories/room-repository.ts";
import type { Room, RoomMember, RoomRole } from "../../../domain/entities/room.ts";

type RoomRow = {
  id: string;
  kind: string;
  name: string | null;
  created_by: string | null;
  dm_key: string | null;
  last_message_at: Date | null;
  created_at: Date;
};

type MemberRow = {
  room_id: string;
  user_id: string;
  role: string;
  joined_at: Date;
  last_read_message_id: string | null;
  muted_until: Date | null;
};

function mapRoom(r: RoomRow): Room {
  return {
    id: r.id,
    kind: r.kind as Room["kind"],
    name: r.name,
    createdBy: r.created_by,
    dmKey: r.dm_key,
    lastMessageAt: r.last_message_at,
    createdAt: r.created_at,
  };
}

function mapMember(r: MemberRow): RoomMember {
  return {
    roomId: r.room_id,
    userId: r.user_id,
    role: r.role as RoomRole,
    joinedAt: r.joined_at,
    lastReadMessageId: r.last_read_message_id,
    mutedUntil: r.muted_until,
  };
}

export class PgRoomRepository implements RoomRepository {
  constructor(private readonly sql: SQL) {}

  async createDm(room: Room, memberA: RoomMember, memberB: RoomMember): Promise<Room> {
    const [existing] = await this.sql<RoomRow[]>`
      INSERT INTO rooms (id, kind, name, created_by, dm_key, last_message_at, created_at)
      VALUES (${room.id}, ${room.kind}, ${room.name}, ${room.createdBy}, ${room.dmKey}, ${room.lastMessageAt}, ${room.createdAt})
      ON CONFLICT (dm_key) DO NOTHING
      RETURNING *
    `;

    if (!existing) {
      const [found] = await this.sql<RoomRow[]>`SELECT * FROM rooms WHERE dm_key = ${room.dmKey}`;
      return mapRoom(found!);
    }

    await this.sql`
      INSERT INTO room_members (room_id, user_id, role, joined_at)
      VALUES (${memberA.roomId}, ${memberA.userId}, ${memberA.role}, ${memberA.joinedAt}),
             (${memberB.roomId}, ${memberB.userId}, ${memberB.role}, ${memberB.joinedAt})
      ON CONFLICT DO NOTHING
    `;

    return mapRoom(existing);
  }

  async createGroup(room: Room, owner: RoomMember): Promise<Room> {
    const [created] = await this.sql<RoomRow[]>`
      INSERT INTO rooms (id, kind, name, created_by, dm_key, last_message_at, created_at)
      VALUES (${room.id}, ${room.kind}, ${room.name}, ${room.createdBy}, ${room.dmKey}, ${room.lastMessageAt}, ${room.createdAt})
      RETURNING *
    `;
    await this.sql`
      INSERT INTO room_members (room_id, user_id, role, joined_at)
      VALUES (${owner.roomId}, ${owner.userId}, ${owner.role}, ${owner.joinedAt})
    `;
    return mapRoom(created!);
  }

  async findById(id: string): Promise<Room | null> {
    const [row] = await this.sql<RoomRow[]>`SELECT * FROM rooms WHERE id = ${id}`;
    return row ? mapRoom(row) : null;
  }

  async findDmBetween(userA: string, userB: string): Promise<Room | null> {
    const dmKey = [userA, userB].sort().join(":");
    const [row] = await this.sql<RoomRow[]>`SELECT * FROM rooms WHERE dm_key = ${dmKey}`;
    return row ? mapRoom(row) : null;
  }

  async listForUser(userId: string): Promise<Room[]> {
    const rows = await this.sql<RoomRow[]>`
      SELECT r.* FROM rooms r
      JOIN room_members rm ON rm.room_id = r.id
      WHERE rm.user_id = ${userId}
      ORDER BY r.last_message_at DESC NULLS LAST, r.created_at DESC
    `;
    return rows.map(mapRoom);
  }

  async addMember(member: RoomMember): Promise<RoomMember> {
    const [row] = await this.sql<MemberRow[]>`
      INSERT INTO room_members (room_id, user_id, role, joined_at, last_read_message_id, muted_until)
      VALUES (${member.roomId}, ${member.userId}, ${member.role}, ${member.joinedAt},
              ${member.lastReadMessageId}, ${member.mutedUntil})
      RETURNING *
    `;
    return mapMember(row!);
  }

  async removeMember(roomId: string, userId: string): Promise<void> {
    await this.sql`DELETE FROM room_members WHERE room_id = ${roomId} AND user_id = ${userId}`;
  }

  async getMember(roomId: string, userId: string): Promise<RoomMember | null> {
    const [row] = await this.sql<MemberRow[]>`
      SELECT * FROM room_members WHERE room_id = ${roomId} AND user_id = ${userId}
    `;
    return row ? mapMember(row) : null;
  }

  async listMembers(roomId: string): Promise<RoomMember[]> {
    const rows = await this.sql<MemberRow[]>`
      SELECT * FROM room_members WHERE room_id = ${roomId} ORDER BY joined_at ASC
    `;
    return rows.map(mapMember);
  }

  async setLastReadMessage(roomId: string, userId: string, messageId: string): Promise<void> {
    await this.sql`
      UPDATE room_members SET last_read_message_id = ${messageId}
      WHERE room_id = ${roomId} AND user_id = ${userId}
    `;
  }

  async bumpLastMessageAt(roomId: string, at: Date): Promise<void> {
    await this.sql`
      UPDATE rooms SET last_message_at = ${at} WHERE id = ${roomId}
    `;
  }

  async updateMemberRole(roomId: string, userId: string, role: RoomRole): Promise<void> {
    await this.sql`
      UPDATE room_members SET role = ${role} WHERE room_id = ${roomId} AND user_id = ${userId}
    `;
  }

  async deleteRoom(id: string): Promise<void> {
    await this.sql`DELETE FROM rooms WHERE id = ${id}`;
  }
}
