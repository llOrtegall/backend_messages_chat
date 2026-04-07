import type { ServerWebSocket } from "bun";
import type { WsData, ConnectionRegistry } from "./connection-registry.ts";
import type { RoomRepository } from "../../domain/ports/repositories/room-repository.ts";
import type { MessageBus } from "../../domain/ports/services/message-bus.ts";
import type { SendMessage } from "../../application/use-cases/messages/send-message.ts";
import type { EditMessage } from "../../application/use-cases/messages/edit-message.ts";
import type { DeleteMessage } from "../../application/use-cases/messages/delete-message.ts";
import type { MarkAsRead } from "../../application/use-cases/messages/mark-as-read.ts";
import { parseEnvelope, buildError } from "./envelope.ts";
import { handlePing } from "./handlers/ping.ts";
import { handleChatSubscribe } from "./handlers/chat-subscribe.ts";
import { handleChatUnsubscribe } from "./handlers/chat-unsubscribe.ts";
import { handleChatSend } from "./handlers/chat-send.ts";
import { handleChatEdit } from "./handlers/chat-edit.ts";
import { handleChatDelete } from "./handlers/chat-delete.ts";
import { handleChatRead } from "./handlers/chat-read.ts";
import { handleChatTyping } from "./handlers/chat-typing.ts";
import { DomainError } from "../../domain/errors/domain-errors.ts";
import { logger } from "../logging/logger.ts";

export interface RouterDeps {
  registry: ConnectionRegistry;
  roomRepo: RoomRepository;
  bus: MessageBus;
  sendMessage: SendMessage;
  editMessage: EditMessage;
  deleteMessage: DeleteMessage;
  markAsRead: MarkAsRead;
}

export class EventRouter {
  constructor(private readonly deps: RouterDeps) {}

  async dispatch(ws: ServerWebSocket<WsData>, raw: string | Buffer): Promise<void> {
    let envelope;
    try {
      envelope = parseEnvelope(raw);
    } catch (err) {
      ws.send(buildError(undefined, "INVALID_ENVELOPE", "Invalid message format"));
      return;
    }

    try {
      switch (envelope.type) {
        case "ping":
          handlePing(ws, envelope);
          break;
        case "chat.subscribe":
          await handleChatSubscribe(ws, envelope, this.deps.registry, this.deps.roomRepo);
          break;
        case "chat.unsubscribe":
          handleChatUnsubscribe(ws, envelope, this.deps.registry);
          break;
        case "chat.send":
          await handleChatSend(ws, envelope, this.deps.sendMessage);
          break;
        case "chat.edit":
          await handleChatEdit(ws, envelope, this.deps.editMessage);
          break;
        case "chat.delete":
          await handleChatDelete(ws, envelope, this.deps.deleteMessage);
          break;
        case "chat.read":
          await handleChatRead(ws, envelope, this.deps.markAsRead);
          break;
        case "chat.typing":
          await handleChatTyping(ws, envelope, this.deps.roomRepo, this.deps.bus);
          break;
        default:
          ws.send(buildError(envelope.refId, "UNKNOWN_TYPE", `Unknown event type: ${envelope.type}`));
      }
    } catch (err) {
      if (err instanceof DomainError) {
        ws.send(buildError(envelope.refId, err.name.toUpperCase().replace("ERROR", ""), err.message));
      } else {
        logger.error({ err, userId: ws.data.userId, type: envelope.type }, "Unhandled WS error");
        ws.send(buildError(envelope.refId, "INTERNAL_ERROR", "Internal server error"));
      }
    }
  }
}
