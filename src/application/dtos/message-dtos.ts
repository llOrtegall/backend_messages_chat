import { z } from "zod";

export const SendMessageSchema = z.object({
  body: z.string().max(4096).default(""),
  attachmentKey: z.string().max(512).optional(),
  clientMessageId: z.string().max(128).optional(),
});
export type SendMessageInput = z.infer<typeof SendMessageSchema>;

export const EditMessageSchema = z.object({
  body: z.string().min(1).max(4096),
});
export type EditMessageInput = z.infer<typeof EditMessageSchema>;

export const ListMessagesQuerySchema = z.object({
  before: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListMessagesQuery = z.infer<typeof ListMessagesQuerySchema>;

export const MarkAsReadSchema = z.object({
  roomId: z.string().uuid(),
  messageId: z.string().uuid(),
});
export type MarkAsReadInput = z.infer<typeof MarkAsReadSchema>;

// Bus event types published to room:{roomId} channels
export type BusEvent =
  | { kind: "message.created"; message: import("../../domain/entities/message.ts").MessageDto; refId?: string; originUserId: string }
  | { kind: "message.edited"; message: import("../../domain/entities/message.ts").MessageDto }
  | { kind: "message.deleted"; messageId: string; roomId: string }
  | { kind: "message.read"; roomId: string; userId: string; messageId: string }
  | { kind: "user.typing"; roomId: string; userId: string };
