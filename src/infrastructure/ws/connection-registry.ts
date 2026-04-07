import type { ServerWebSocket } from "bun";
import type { MessageBus, Unsubscribe } from "../../domain/ports/services/message-bus.ts";

export interface WsData {
  userId: string;
  connId: string;
  rooms: Set<string>;
}

export class ConnectionRegistry {
  private readonly userConns = new Map<string, Set<ServerWebSocket<WsData>>>();
  private readonly roomLocalSubs = new Map<string, Set<ServerWebSocket<WsData>>>();
  private readonly roomBusUnsub = new Map<string, { unsub: Unsubscribe; refCount: number }>();

  constructor(private readonly bus: MessageBus) {}

  register(ws: ServerWebSocket<WsData>): void {
    const { userId } = ws.data;
    let conns = this.userConns.get(userId);
    if (!conns) { conns = new Set(); this.userConns.set(userId, conns); }
    conns.add(ws);
  }

  unregister(ws: ServerWebSocket<WsData>): void {
    for (const roomId of [...ws.data.rooms]) {
      this.unsubscribeRoom(ws, roomId);
    }
    const conns = this.userConns.get(ws.data.userId);
    if (conns) {
      conns.delete(ws);
      if (conns.size === 0) this.userConns.delete(ws.data.userId);
    }
  }

  async subscribeRoom(ws: ServerWebSocket<WsData>, roomId: string): Promise<void> {
    let subs = this.roomLocalSubs.get(roomId);
    if (!subs) { subs = new Set(); this.roomLocalSubs.set(roomId, subs); }
    subs.add(ws);
    ws.data.rooms.add(roomId);

    const existing = this.roomBusUnsub.get(roomId);
    if (existing) {
      existing.refCount++;
    } else {
      const unsub = await this.bus.subscribe(`room:${roomId}`, (event) => {
        this.fanOutBusEvent(roomId, event);
      });
      this.roomBusUnsub.set(roomId, { unsub, refCount: 1 });
    }
  }

  unsubscribeRoom(ws: ServerWebSocket<WsData>, roomId: string): void {
    const subs = this.roomLocalSubs.get(roomId);
    if (subs) {
      subs.delete(ws);
      if (subs.size === 0) this.roomLocalSubs.delete(roomId);
    }
    ws.data.rooms.delete(roomId);

    const existing = this.roomBusUnsub.get(roomId);
    if (existing) {
      existing.refCount--;
      if (existing.refCount <= 0) {
        existing.unsub();
        this.roomBusUnsub.delete(roomId);
      }
    }
  }

  private fanOutBusEvent(roomId: string, event: unknown): void {
    const subs = this.roomLocalSubs.get(roomId);
    if (!subs?.size) return;

    const e = event as Record<string, unknown>;
    const { kind, ...rest } = e;
    let type = kind as string;
    let payload: unknown;
    let refId: string | undefined;

    switch (kind) {
      case "message.created":
      case "message.edited":
        payload = rest.message;
        refId = rest.refId as string | undefined;
        break;
      case "message.deleted":
        payload = { messageId: rest.messageId, roomId: rest.roomId };
        break;
      case "message.read":
        payload = { roomId: rest.roomId, userId: rest.userId, messageId: rest.messageId };
        break;
      case "user.typing":
        payload = { roomId: rest.roomId, userId: rest.userId };
        break;
      default:
        payload = rest;
    }

    const envelope = JSON.stringify({ type, payload, refId, ts: Date.now() });
    for (const ws of subs) {
      ws.send(envelope);
    }
  }
}
