import type { UserRepository } from "../../src/domain/ports/repositories/user-repository.ts";
import type { PresenceStore } from "../../src/domain/ports/services/presence-store.ts";
import type { RefreshTokenRepository } from "../../src/domain/ports/repositories/refresh-token-repository.ts";
import type { EmailTokenRepository } from "../../src/domain/ports/repositories/email-token-repository.ts";
import type { RoomRepository } from "../../src/domain/ports/repositories/room-repository.ts";
import type { MessageRepository } from "../../src/domain/ports/repositories/message-repository.ts";
import type { MessageBus, Unsubscribe } from "../../src/domain/ports/services/message-bus.ts";
import type { PasswordHasher } from "../../src/domain/ports/services/password-hasher.ts";
import type { EmailSender } from "../../src/domain/ports/services/email-sender.ts";
import type { Clock } from "../../src/domain/ports/services/clock.ts";
import type { IdGenerator } from "../../src/domain/ports/services/id-generator.ts";
import type { ObjectStorage, PresignedPut } from "../../src/domain/ports/services/object-storage.ts";
import type { User } from "../../src/domain/entities/user.ts";
import type { Room, RoomMember, RoomRole } from "../../src/domain/entities/room.ts";
import type { Message } from "../../src/domain/entities/message.ts";
import type { RefreshToken } from "../../src/domain/entities/refresh-token.ts";
import type { EmailToken } from "../../src/domain/entities/email-token.ts";

// --- PresenceStore ---
export class FakePresenceStore implements PresenceStore {
  private readonly store = new Map<string, Map<string, number>>();

  async markOnline(userId: string, connId: string, _ttlSec: number): Promise<void> {
    if (!this.store.has(userId)) this.store.set(userId, new Map());
    this.store.get(userId)!.set(connId, Date.now());
  }
  async markOffline(userId: string, connId: string): Promise<boolean> {
    const conns = this.store.get(userId);
    if (!conns?.has(connId)) return false;
    conns.delete(connId);
    if (conns.size === 0) this.store.delete(userId);
    return true;
  }
  async heartbeat(userId: string, connId: string, _ttlSec: number): Promise<void> {
    if (!this.store.has(userId)) this.store.set(userId, new Map());
    this.store.get(userId)!.set(connId, Date.now());
  }
  async isOnline(userId: string): Promise<boolean> {
    return (this.store.get(userId)?.size ?? 0) > 0;
  }
  async listOnline(userIds: string[]): Promise<string[]> {
    return userIds.filter(uid => (this.store.get(uid)?.size ?? 0) > 0);
  }
}

// --- Clock ---
export class FakeClock implements Clock {
  constructor(private time = new Date("2025-01-01T00:00:00Z")) {}
  now() { return this.time; }
  advance(ms: number) { this.time = new Date(this.time.getTime() + ms); }
}

// --- IdGenerator ---
export class FakeIdGenerator implements IdGenerator {
  private seq = 0;
  uuidv7() {
    const n = String(++this.seq).padStart(12, "0");
    return `00000000-0000-7000-8000-${n}`;
  }
}

// --- PasswordHasher (no-op for speed) ---
export class FakePasswordHasher implements PasswordHasher {
  async hash(plain: string) { return `hashed:${plain}`; }
  async verify(plain: string, hash: string) { return hash === `hashed:${plain}`; }
}

// --- EmailSender ---
export class FakeEmailSender implements EmailSender {
  sent: Array<{ to: string; link: string; kind: "verify" | "reset" }> = [];
  async sendVerification(to: string, link: string) { this.sent.push({ to, link, kind: "verify" }); }
  async sendPasswordReset(to: string, link: string) { this.sent.push({ to, link, kind: "reset" }); }
}

// --- MessageBus ---
export class FakeMessageBus implements MessageBus {
  published: Array<{ channel: string; event: unknown }> = [];
  private handlers = new Map<string, Set<(e: unknown) => void>>();

  async publish(channel: string, event: unknown) {
    this.published.push({ channel, event });
    this.handlers.get(channel)?.forEach(h => h(event));
  }

  async subscribe(channel: string, handler: (e: unknown) => void): Promise<Unsubscribe> {
    if (!this.handlers.has(channel)) this.handlers.set(channel, new Set());
    this.handlers.get(channel)!.add(handler);
    return () => { this.handlers.get(channel)?.delete(handler); };
  }

  lastPublished(channel: string) {
    return [...this.published].reverse().find(p => p.channel === channel)?.event ?? null;
  }
}

// --- ObjectStorage ---
export class FakeObjectStorage implements ObjectStorage {
  uploadedKeys = new Set<string>();

  async presignPut(key: string, _ct: string, _size: number, ttlSec: number): Promise<PresignedPut> {
    return { url: `https://fake-storage/${key}?presign=1`, key, expiresAt: new Date(Date.now() + ttlSec * 1000) };
  }

  async headObject(key: string) { return this.uploadedKeys.has(key); }
  publicUrl(key: string) { return `https://fake-storage/${key}`; }
  simulateUpload(key: string) { this.uploadedKeys.add(key); }
}

// --- UserRepository ---
export class InMemoryUserRepo implements UserRepository {
  private store = new Map<string, User>();

  async create(data: Omit<User, "createdAt" | "updatedAt">) {
    const user: User = { ...data, createdAt: new Date(), updatedAt: new Date() };
    this.store.set(user.id, user);
    return user;
  }
  async findById(id: string) { return this.store.get(id) ?? null; }
  async findByEmail(email: string) {
    return [...this.store.values()].find(u => u.email === email) ?? null;
  }
  async update(id: string, patch: Partial<Pick<User, "displayName" | "avatarUrl" | "emailVerifiedAt" | "passwordHash">>) {
    const user = this.store.get(id);
    if (!user) throw new Error("User not found");
    Object.assign(user, patch, { updatedAt: new Date() });
    return user;
  }
}

// --- RefreshTokenRepository ---
export class InMemoryRefreshTokenRepo implements RefreshTokenRepository {
  readonly store = new Map<string, RefreshToken>();

  async insert(record: Omit<RefreshToken, "createdAt">): Promise<void> {
    this.store.set(record.id, { ...record, createdAt: new Date() });
  }
  async findById(id: string) { return this.store.get(id) ?? null; }
  async findByHash(hash: string) {
    return [...this.store.values()].find(t => t.tokenHash === hash) ?? null;
  }
  async markRevoked(id: string, replacedById?: string) {
    const t = this.store.get(id);
    if (t) { t.revokedAt = new Date(); if (replacedById) t.replacedById = replacedById; }
  }
  async revokeFamily(familyId: string) {
    for (const t of this.store.values()) {
      if (t.familyId === familyId) t.revokedAt = new Date();
    }
  }
  async revokeAllForUser(userId: string) {
    for (const t of this.store.values()) {
      if (t.userId === userId && !t.revokedAt) t.revokedAt = new Date();
    }
  }
  async listActiveByUser(userId: string) {
    return [...this.store.values()].filter(t => t.userId === userId && !t.revokedAt);
  }
}

// --- EmailTokenRepository ---
export class InMemoryEmailTokenRepo implements EmailTokenRepository {
  private store = new Map<string, EmailToken>();

  async insert(record: Omit<EmailToken, "usedAt">): Promise<void> {
    this.store.set(record.id, { ...record, usedAt: null });
  }
  async consume(hash: string, kind: EmailToken["kind"]) {
    const token = [...this.store.values()].find(t => t.tokenHash === hash && t.kind === kind && !t.usedAt);
    if (!token) return null;
    token.usedAt = new Date();
    return token;
  }
}

// --- RoomRepository ---
export class InMemoryRoomRepo implements RoomRepository {
  rooms = new Map<string, Room>();
  members = new Map<string, RoomMember>(); // key = roomId:userId

  private mkey(roomId: string, userId: string) { return `${roomId}:${userId}`; }

  async createDm(room: Room, a: RoomMember, b: RoomMember) {
    const existing = [...this.rooms.values()].find(r => r.dmKey === room.dmKey);
    if (existing) return existing;
    this.rooms.set(room.id, room);
    this.members.set(this.mkey(a.roomId, a.userId), a);
    this.members.set(this.mkey(b.roomId, b.userId), b);
    return room;
  }
  async createGroup(room: Room, owner: RoomMember) {
    this.rooms.set(room.id, room);
    this.members.set(this.mkey(owner.roomId, owner.userId), owner);
    return room;
  }
  async findById(id: string) { return this.rooms.get(id) ?? null; }
  async findDmBetween(a: string, b: string) {
    const key = [a, b].sort().join(":");
    return [...this.rooms.values()].find(r => r.dmKey === key) ?? null;
  }
  async listForUser(userId: string) {
    const roomIds = new Set([...this.members.values()].filter(m => m.userId === userId).map(m => m.roomId));
    return [...roomIds].map(id => this.rooms.get(id)!).filter(Boolean);
  }
  async addMember(m: RoomMember) {
    this.members.set(this.mkey(m.roomId, m.userId), m);
    return m;
  }
  async removeMember(roomId: string, userId: string) {
    this.members.delete(this.mkey(roomId, userId));
  }
  async getMember(roomId: string, userId: string) {
    return this.members.get(this.mkey(roomId, userId)) ?? null;
  }
  async listMembers(roomId: string) {
    return [...this.members.values()].filter(m => m.roomId === roomId);
  }
  async setLastReadMessage(roomId: string, userId: string, messageId: string) {
    const m = this.members.get(this.mkey(roomId, userId));
    if (m) m.lastReadMessageId = messageId;
  }
  async bumpLastMessageAt(roomId: string, at: Date) {
    const r = this.rooms.get(roomId);
    if (r) r.lastMessageAt = at;
  }
  async updateMemberRole(roomId: string, userId: string, role: RoomRole) {
    const m = this.members.get(this.mkey(roomId, userId));
    if (m) m.role = role;
  }
}

// --- MessageRepository ---
export class InMemoryMessageRepo implements MessageRepository {
  messages = new Map<string, Message>();

  async insert(msg: Message) {
    // Idempotency: if same sender+clientMessageId exists, return existing
    if (msg.clientMessageId) {
      const existing = [...this.messages.values()].find(
        m => m.senderId === msg.senderId && m.clientMessageId === msg.clientMessageId
      );
      if (existing) return existing;
    }
    this.messages.set(msg.id, { ...msg });
    return msg;
  }
  async findById(id: string) { return this.messages.get(id) ?? null; }
  async listByRoom({ roomId, before, limit }: { roomId: string; before?: string; limit: number }) {
    return [...this.messages.values()]
      .filter(m => m.roomId === roomId && (!before || m.id < before))
      .sort((a, b) => b.id.localeCompare(a.id))
      .slice(0, limit);
  }
  async update(id: string, patch: Partial<Pick<Message, "body" | "editedAt">>) {
    const msg = this.messages.get(id);
    if (!msg) throw new Error("Message not found");
    Object.assign(msg, patch);
    return msg;
  }
  async softDelete(id: string) {
    const msg = this.messages.get(id);
    if (!msg) throw new Error("Message not found");
    msg.deletedAt = new Date();
    msg.body = "";
    msg.attachmentKey = null;
    msg.attachmentMeta = null;
    return msg;
  }
}
