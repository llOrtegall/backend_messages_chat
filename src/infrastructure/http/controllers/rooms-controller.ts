import type { RouteHandler } from "../compose.ts";
import type { CreateDirectRoom } from "../../../application/use-cases/rooms/create-direct-room.ts";
import type { CreateGroupRoom } from "../../../application/use-cases/rooms/create-group-room.ts";
import type { AddMember } from "../../../application/use-cases/rooms/add-member.ts";
import type { RemoveMember } from "../../../application/use-cases/rooms/remove-member.ts";
import type { ListMyRooms } from "../../../application/use-cases/rooms/list-my-rooms.ts";
import type { GetRoom } from "../../../application/use-cases/rooms/get-room.ts";
import { validate } from "../validation/validate.ts";
import {
  CreateDirectRoomSchema,
  CreateGroupRoomSchema,
  AddMemberSchema,
  RemoveMemberSchema,
} from "../../../application/dtos/room-dtos.ts";

interface Deps {
  createDirectRoom: CreateDirectRoom;
  createGroupRoom: CreateGroupRoom;
  addMember: AddMember;
  removeMember: RemoveMember;
  listMyRooms: ListMyRooms;
  getRoom: GetRoom;
}

function roomId(req: Request): string {
  return req.url.match(/\/rooms\/([^/]+)/)?.[1]!;
}

export class RoomsController {
  constructor(private readonly deps: Deps) {}

  list: RouteHandler = async (_req, ctx) => {
    const rooms = await this.deps.listMyRooms.execute(ctx.userId!);
    return Response.json({ rooms });
  };

  create: RouteHandler = async (req, ctx) => {
    const body = await req.json() as Record<string, unknown>;

    if ("targetUserId" in body) {
      const { targetUserId } = validate(CreateDirectRoomSchema, body);
      const room = await this.deps.createDirectRoom.execute(ctx.userId!, targetUserId);
      return Response.json({ room }, { status: 201 });
    }

    const { name, memberIds } = validate(CreateGroupRoomSchema, body);
    const room = await this.deps.createGroupRoom.execute(ctx.userId!, name, memberIds);
    return Response.json({ room }, { status: 201 });
  };

  getOne: RouteHandler = async (req, ctx) => {
    const room = await this.deps.getRoom.execute(ctx.userId!, roomId(req));
    return Response.json({ room });
  };

  addMember: RouteHandler = async (req, ctx) => {
    const { userId, role } = validate(AddMemberSchema, await req.json());
    const member = await this.deps.addMember.execute(ctx.userId!, roomId(req), userId, role);
    return Response.json({ member }, { status: 201 });
  };

  removeMember: RouteHandler = async (req, ctx) => {
    const { userId } = validate(RemoveMemberSchema, await req.json());
    await this.deps.removeMember.execute(ctx.userId!, roomId(req), userId);
    return new Response(null, { status: 204 });
  };
}
