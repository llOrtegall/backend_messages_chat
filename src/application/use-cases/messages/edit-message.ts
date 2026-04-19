import type { MessageRepository } from "../../../domain/ports/repositories/message-repository.ts";
import type { MessageBus } from "../../../domain/ports/services/message-bus.ts";
import type { Clock } from "../../../domain/ports/services/clock.ts";
import { toMessageDto, type MessageDto } from "../../../domain/entities/message.ts";
import { ForbiddenError, NotFoundError } from "../../../domain/errors/domain-errors.ts";

interface Deps {
  messageRepo: MessageRepository;
  bus: MessageBus;
  clock: Clock;
}

export class EditMessage {
  constructor(private readonly deps: Deps) {}

  async execute(requesterId: string, messageId: string, body: string): Promise<MessageDto> {
    const msg = await this.deps.messageRepo.findById(messageId);
    if (!msg) throw new NotFoundError("Message not found");
    if (msg.deletedAt) throw new NotFoundError("Message not found");
    if (msg.senderId !== requesterId) throw new ForbiddenError("Cannot edit another user's message");
    if (msg.body === body) return toMessageDto(msg);

    const updated = await this.deps.messageRepo.update(messageId, {
      body,
      editedAt: this.deps.clock.now(),
    });

    const dto = toMessageDto(updated);
    await this.deps.bus.publish(`room:${msg.roomId}`, { kind: "message.edited", message: dto });

    return dto;
  }
}
