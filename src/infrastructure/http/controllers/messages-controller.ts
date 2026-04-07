import type { RouteHandler } from "../compose.ts";
import type { SendMessage } from "../../../application/use-cases/messages/send-message.ts";
import type { EditMessage } from "../../../application/use-cases/messages/edit-message.ts";
import type { DeleteMessage } from "../../../application/use-cases/messages/delete-message.ts";
import type { ListMessages } from "../../../application/use-cases/messages/list-messages.ts";
import { validate } from "../validation/validate.ts";
import {
  SendMessageSchema,
  EditMessageSchema,
  ListMessagesQuerySchema,
} from "../../../application/dtos/message-dtos.ts";

interface Deps {
  sendMessage: SendMessage;
  editMessage: EditMessage;
  deleteMessage: DeleteMessage;
  listMessages: ListMessages;
}

function roomId(req: Request): string {
  return req.url.match(/\/rooms\/([^/]+)/)?.[1]!;
}

function messageId(req: Request): string {
  return req.url.match(/\/messages\/([^/]+)/)?.[1]!;
}

export class MessagesController {
  constructor(private readonly deps: Deps) {}

  listByRoom: RouteHandler = async (req, ctx) => {
    const url = new URL(req.url);
    const query = validate(ListMessagesQuerySchema, {
      before: url.searchParams.get("before") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });
    const messages = await this.deps.listMessages.execute({
      roomId: roomId(req),
      requesterId: ctx.userId!,
      before: query.before,
      limit: query.limit,
    });
    return Response.json({ messages });
  };

  sendToRoom: RouteHandler = async (req, ctx) => {
    const body = validate(SendMessageSchema, await req.json());
    const message = await this.deps.sendMessage.execute({
      roomId: roomId(req),
      senderId: ctx.userId!,
      body: body.body,
      attachmentKey: body.attachmentKey,
      clientMessageId: body.clientMessageId,
    });
    return Response.json({ message }, { status: 201 });
  };

  edit: RouteHandler = async (req, ctx) => {
    const { body } = validate(EditMessageSchema, await req.json());
    const message = await this.deps.editMessage.execute(ctx.userId!, messageId(req), body);
    return Response.json({ message });
  };

  delete: RouteHandler = async (req, ctx) => {
    await this.deps.deleteMessage.execute(ctx.userId!, messageId(req));
    return new Response(null, { status: 204 });
  };
}
