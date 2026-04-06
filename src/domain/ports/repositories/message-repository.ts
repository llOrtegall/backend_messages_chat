import type { Message } from "../../entities/message.ts";

export interface MessageRepository {
  insert(msg: Message): Promise<Message>;
  findById(id: string): Promise<Message | null>;
  listByRoom(params: { roomId: string; before?: string; limit: number }): Promise<Message[]>;
  update(id: string, patch: Partial<Pick<Message, "body" | "editedAt">>): Promise<Message>;
  softDelete(id: string): Promise<Message>;
}
