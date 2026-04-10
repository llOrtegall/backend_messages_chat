import type { MessageRepository } from "../../../domain/ports/repositories/message-repository.ts";
import type { RoomRepository } from "../../../domain/ports/repositories/room-repository.ts";
import type { MessageBus } from "../../../domain/ports/services/message-bus.ts";
import type { IdGenerator } from "../../../domain/ports/services/id-generator.ts";
import type { Clock } from "../../../domain/ports/services/clock.ts";
import type { ObjectStorage } from "../../../domain/ports/services/object-storage.ts";
import { toMessageDto, type MessageDto } from "../../../domain/entities/message.ts";
import { ConflictError, ForbiddenError } from "../../../domain/errors/domain-errors.ts";

interface Deps {
  messageRepo: MessageRepository;
  roomRepo: RoomRepository;
  bus: MessageBus;
  idGenerator: IdGenerator;
  clock: Clock;
  objectStorage: ObjectStorage;
}

interface Input {
  roomId: string;
  senderId: string;
  body: string;
  attachmentKey?: string;
  clientMessageId?: string;
  refId?: string;
}

export class SendMessage {
  constructor(private readonly deps: Deps) {}

  async execute(input: Input): Promise<MessageDto> {
    const member = await this.deps.roomRepo.getMember(input.roomId, input.senderId);
    if (!member) throw new ForbiddenError("Not a member of this room");

    if (input.attachmentKey) {
      const exists = await this.deps.objectStorage.headObject(input.attachmentKey);
      if (!exists) throw new ConflictError("Attachment not found; upload it first via presign");
    }

    const id = this.deps.idGenerator.uuidv7();
    const now = this.deps.clock.now();

    const msg = await this.deps.messageRepo.insert({
      id,
      roomId: input.roomId,
      senderId: input.senderId,
      body: input.body,
      clientMessageId: input.clientMessageId ?? null,
      attachmentKey: input.attachmentKey ?? null,
      attachmentMeta: null,
      editedAt: null,
      deletedAt: null,
      createdAt: now,
    });

    await this.deps.roomRepo.bumpLastMessageAt(input.roomId, now);

    const dto = toMessageDto(msg);
    await this.deps.bus.publish(`room:${input.roomId}`, {
      kind: "message.created",
      message: dto,
      refId: input.refId,
      originUserId: input.senderId,
    });

    return dto;
  }
}
