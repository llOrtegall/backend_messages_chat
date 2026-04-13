import { env } from "./infrastructure/config/env.ts";
import { logger } from "./infrastructure/logging/logger.ts";
import { sql } from "./infrastructure/db/client.ts";
import { redisPublisher, redisSubscriber } from "./infrastructure/redis/client.ts";

import { JoseTokenSigner } from "./infrastructure/jwt/jose-token-signer.ts";
import { BunPasswordHasher } from "./infrastructure/crypto/bun-password-hasher.ts";
import { ConsoleEmailSender } from "./infrastructure/email/console-email-sender.ts";
import type { EmailSender } from "./domain/ports/services/email-sender.ts";
import { SystemClock } from "./infrastructure/services/system-clock.ts";
import { SystemIdGenerator } from "./infrastructure/services/system-id-generator.ts";
import { RedisRateLimiter } from "./infrastructure/redis/redis-rate-limiter.ts";

import { PgUserRepository } from "./infrastructure/db/repositories/pg-user-repository.ts";
import { PgRefreshTokenRepository } from "./infrastructure/db/repositories/pg-refresh-token-repository.ts";
import { PgEmailTokenRepository } from "./infrastructure/db/repositories/pg-email-token-repository.ts";
import { PgRoomRepository } from "./infrastructure/db/repositories/pg-room-repository.ts";
import { PgMessageRepository } from "./infrastructure/db/repositories/pg-message-repository.ts";
import { RedisMessageBus } from "./infrastructure/redis/redis-message-bus.ts";
import { RedisPresenceStore } from "./infrastructure/redis/redis-presence-store.ts";

import { RegisterUser } from "./application/use-cases/auth/register-user.ts";
import { LoginUser } from "./application/use-cases/auth/login-user.ts";
import { RefreshSession } from "./application/use-cases/auth/refresh-session.ts";
import { RevokeSession } from "./application/use-cases/auth/revoke-session.ts";
import { GetCurrentUser } from "./application/use-cases/auth/get-current-user.ts";
import { RequestEmailVerification } from "./application/use-cases/auth/request-email-verification.ts";
import { ConfirmEmailVerification } from "./application/use-cases/auth/confirm-email-verification.ts";
import { RequestPasswordReset } from "./application/use-cases/auth/request-password-reset.ts";
import { ConfirmPasswordReset } from "./application/use-cases/auth/confirm-password-reset.ts";

import { GetUser } from "./application/use-cases/users/get-user.ts";
import { UpdateProfile } from "./application/use-cases/users/update-profile.ts";
import { ListUsers } from "./application/use-cases/users/list-users.ts";

import { RoomAuthorizer } from "./application/services/room-authorizer.ts";
import { CreateDirectRoom } from "./application/use-cases/rooms/create-direct-room.ts";
import { CreateGroupRoom } from "./application/use-cases/rooms/create-group-room.ts";
import { AddMember } from "./application/use-cases/rooms/add-member.ts";
import { RemoveMember } from "./application/use-cases/rooms/remove-member.ts";
import { ListMyRooms } from "./application/use-cases/rooms/list-my-rooms.ts";
import { GetRoom } from "./application/use-cases/rooms/get-room.ts";
import { DeleteRoom } from "./application/use-cases/rooms/delete-room.ts";

import { SendMessage } from "./application/use-cases/messages/send-message.ts";
import { EditMessage } from "./application/use-cases/messages/edit-message.ts";
import { DeleteMessage } from "./application/use-cases/messages/delete-message.ts";
import { ListMessages } from "./application/use-cases/messages/list-messages.ts";
import { MarkAsRead } from "./application/use-cases/messages/mark-as-read.ts";

import { PresignAttachment } from "./application/use-cases/attachments/presign-attachment.ts";
import { ConfirmAttachment } from "./application/use-cases/attachments/confirm-attachment.ts";
import { MarkUserOnline } from "./application/use-cases/presence/mark-user-online.ts";
import { MarkUserOffline } from "./application/use-cases/presence/mark-user-offline.ts";
import { Heartbeat } from "./application/use-cases/presence/heartbeat.ts";

import { AuthController } from "./infrastructure/http/controllers/auth-controller.ts";
import { UsersController } from "./infrastructure/http/controllers/users-controller.ts";
import { RoomsController } from "./infrastructure/http/controllers/rooms-controller.ts";
import { MessagesController } from "./infrastructure/http/controllers/messages-controller.ts";
import { AttachmentsController } from "./infrastructure/http/controllers/attachments-controller.ts";
import { S3ObjectStorage } from "./infrastructure/storage/s3-object-storage.ts";
import { RedisWsTicketStore } from "./infrastructure/redis/redis-ws-ticket-store.ts";
import { ConnectionRegistry } from "./infrastructure/ws/connection-registry.ts";
import { EventRouter } from "./infrastructure/ws/event-router.ts";
import { WsGateway } from "./infrastructure/ws/gateway.ts";
import { IssueWsTicket } from "./application/use-cases/ws/issue-ws-ticket.ts";
import { WsController } from "./infrastructure/http/controllers/ws-controller.ts";

import type { TokenSigner } from "./domain/ports/services/token-signer.ts";
import type { RateLimiter } from "./domain/ports/services/rate-limiter.ts";
import type { ObjectStorage } from "./domain/ports/services/object-storage.ts";

export interface BuildAppOverrides {
  emailSender?: EmailSender;
  objectStorage?: ObjectStorage;
}

export interface AppContext {
  auth: AuthController;
  users: UsersController;
  rooms: RoomsController;
  messages: MessagesController;
  attachments: AttachmentsController;
  ws: WsController;
  gateway: WsGateway;
  tokenSigner: TokenSigner;
  rateLimiter: RateLimiter;
}

export function buildApp(overrides: BuildAppOverrides = {}): AppContext {
  const tokenSigner = new JoseTokenSigner({
    accessSecret: env.JWT_ACCESS_SECRET,
    accessTtlSec: env.ACCESS_TTL,
    refreshPepper: env.JWT_REFRESH_PEPPER,
  });
  const passwordHasher = new BunPasswordHasher();
  const emailSender = overrides.emailSender ?? new ConsoleEmailSender(logger);
  const clock = new SystemClock();
  const idGenerator = new SystemIdGenerator();
  const rateLimiter = new RedisRateLimiter(redisPublisher);

  const userRepo = new PgUserRepository(sql);
  const refreshTokenRepo = new PgRefreshTokenRepository(sql);
  const emailTokenRepo = new PgEmailTokenRepository(sql);
  const roomRepo = new PgRoomRepository(sql);
  const messageRepo = new PgMessageRepository(sql);
  const bus = new RedisMessageBus(redisPublisher, redisSubscriber);
  const presenceStore = new RedisPresenceStore(redisPublisher);
  const objectStorage = overrides.objectStorage ?? new S3ObjectStorage({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
    bucket: env.S3_BUCKET,
    publicUrl: env.S3_PUBLIC_URL,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
  });

  const sessionDeps = {
    refreshTokenRepo,
    tokenSigner,
    idGenerator,
    clock,
    refreshTtlSec: env.REFRESH_TTL,
  };

  const registerUser = new RegisterUser({
    ...sessionDeps,
    userRepo,
    passwordHasher,
    emailTokenRepo,
    emailSender,
    emailVerifyUrlBase: env.EMAIL_VERIFY_URL_BASE,
  });

  const loginUser = new LoginUser({
    ...sessionDeps,
    userRepo,
    passwordHasher,
  });

  const refreshSession = new RefreshSession({
    refreshTokenRepo,
    tokenSigner,
    idGenerator,
    clock,
    refreshTtlSec: env.REFRESH_TTL,
    refreshPepper: env.JWT_REFRESH_PEPPER,
    graceWindowSec: env.REFRESH_GRACE_WINDOW_SECS,
  });

  const revokeSession = new RevokeSession(refreshTokenRepo, env.JWT_REFRESH_PEPPER);
  const getCurrentUser = new GetCurrentUser(userRepo);

  const requestEmailVerification = new RequestEmailVerification({
    userRepo,
    emailTokenRepo,
    emailSender,
    idGenerator,
    clock,
    emailVerifyUrlBase: env.EMAIL_VERIFY_URL_BASE,
  });

  const confirmEmailVerification = new ConfirmEmailVerification(emailTokenRepo, userRepo, clock);

  const requestPasswordReset = new RequestPasswordReset({
    userRepo,
    emailTokenRepo,
    emailSender,
    idGenerator,
    clock,
    emailResetUrlBase: env.EMAIL_RESET_URL_BASE,
  });

  const confirmPasswordReset = new ConfirmPasswordReset({
    emailTokenRepo,
    userRepo,
    refreshTokenRepo,
    passwordHasher,
  });

  const auth = new AuthController({
    registerUser,
    loginUser,
    refreshSession,
    revokeSession,
    getCurrentUser,
    requestEmailVerification,
    confirmEmailVerification,
    requestPasswordReset,
    confirmPasswordReset,
  });

  const getUser = new GetUser(userRepo);
  const updateProfile = new UpdateProfile(userRepo);
  const listUsers = new ListUsers({ userRepo, presenceStore });
  const users = new UsersController({ getUser, updateProfile, listUsers });

  const roomAuthorizer = new RoomAuthorizer(roomRepo);
  const createDirectRoom = new CreateDirectRoom({ roomRepo, userRepo, idGenerator, clock });
  const createGroupRoom = new CreateGroupRoom({ roomRepo, userRepo, idGenerator, clock });
  const addMember = new AddMember({ roomRepo, userRepo, clock, authorizer: roomAuthorizer });
  const removeMember = new RemoveMember({ roomRepo, authorizer: roomAuthorizer });
  const listMyRooms = new ListMyRooms(roomRepo);
  const getRoom = new GetRoom({ roomRepo, authorizer: roomAuthorizer });
  const deleteRoom = new DeleteRoom({ roomRepo, authorizer: roomAuthorizer });

  const rooms = new RoomsController({
    createDirectRoom,
    createGroupRoom,
    addMember,
    removeMember,
    listMyRooms,
    getRoom,
    deleteRoom,
  });

  const sendMessage = new SendMessage({ messageRepo, roomRepo, bus, idGenerator, clock, objectStorage });
  const editMessage = new EditMessage({ messageRepo, bus, clock });
  const deleteMessage = new DeleteMessage({ messageRepo, roomRepo, bus });
  const listMessages = new ListMessages({ messageRepo, roomRepo });
  const markAsRead = new MarkAsRead({ messageRepo, roomRepo, bus });

  const messagesCtrl = new MessagesController({
    sendMessage,
    editMessage,
    deleteMessage,
    listMessages,
  });

  const presignAttachment = new PresignAttachment({ objectStorage, idGenerator });
  const confirmAttachment = new ConfirmAttachment(objectStorage);
  const attachments = new AttachmentsController({ presignAttachment, confirmAttachment });

  const markUserOnline = new MarkUserOnline({ presenceStore, bus });
  const markUserOffline = new MarkUserOffline({ presenceStore, bus });
  const heartbeat = new Heartbeat(presenceStore);

  const ticketStore = new RedisWsTicketStore(redisPublisher);
  const issueWsTicket = new IssueWsTicket({ ticketStore, ticketTtlSec: env.WS_TICKET_TTL });
  const ws = new WsController({ issueWsTicket });

  const registry = new ConnectionRegistry(bus);
  const router = new EventRouter({
    registry,
    roomRepo,
    bus,
    sendMessage,
    editMessage,
    deleteMessage,
    markAsRead,
    heartbeat,
    presenceTtlSec: env.WS_PRESENCE_TTL,
  });
  const gateway = new WsGateway(registry, router, tokenSigner, ticketStore, idGenerator, {
    markUserOnline,
    markUserOffline,
    presenceTtlSec: env.WS_PRESENCE_TTL,
  });

  return { auth, users, rooms, messages: messagesCtrl, attachments, ws, gateway, tokenSigner, rateLimiter };
}
