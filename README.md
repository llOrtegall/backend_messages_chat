# backend_messages_chat

Backend de chat en tiempo real: REST + WebSocket, multi-instancia con Redis pub/sub, arquitectura hexagonal.

## Stack

| Capa | Tecnología |
|---|---|
| Runtime | [Bun](https://bun.sh) |
| HTTP / WS | `Bun.serve` nativo (sin Express) |
| Base de datos | PostgreSQL 16 + `Bun.sql` |
| Cache / pub-sub | Redis 7 + `Bun.redis` |
| Storage | S3-compatible (Cloudflare R2 en prod, MinIO en dev) |
| Auth | JWT access (HS256, `jose`) + refresh opaco rotado en DB |
| Validación | Zod |
| Logging | pino |
| Tests | `bun:test` |

---

## Requisitos

- Bun ≥ 1.3
- Docker + Docker Compose (para Postgres, Redis y MinIO en dev)
- (Opcional) `websocat` para el smoke test WS

---

## Quick start

```bash
# 1. Dependencias
bun install

# 2. Variables de entorno
cp .env.example .env

# 3. Servicios dev (Postgres, Redis, MinIO)
docker compose -f docker-compose.dev.yml up -d

# 4. Migraciones
bun run migrate

# 5. Seed de desarrollo (3 usuarios + rooms de prueba)
bun run seed

# 6. Servidor en modo watch
bun run dev
```

El servidor arranca en `http://localhost:3000` (o el `PORT` configurado).

Para simular multi-instancia localmente:

```bash
PORT=3001 bun run dev   # segunda instancia
```

---

## Configuración (`.env`)

| Variable | Default (dev) | Descripción |
|---|---|---|
| `PORT` | `3000` | Puerto HTTP |
| `DATABASE_URL` | `postgres://chat:chat@localhost:5432/chat` | |
| `REDIS_URL` | `redis://localhost:6379` | |
| `JWT_ACCESS_SECRET` | *(dev default)* | **Cambiar en prod** — `openssl rand -base64 32` |
| `JWT_REFRESH_PEPPER` | *(dev default)* | **Cambiar en prod** |
| `ACCESS_TTL` | `900` | Segundos de validez del access token |
| `REFRESH_TTL` | `2592000` | Segundos de validez del refresh token (30 días) |
| `REFRESH_GRACE_WINDOW_SECS` | `0` | Ventana (s) para aceptar un token ya rotado en mobile; `0` = desactivado |
| `CORS_ORIGINS` | `http://localhost:5173` | Lista separada por comas |
| `RATE_LIMIT_*` | ver `.env.example` | Límites de rate limiting por endpoint |
| `S3_ENDPOINT` | `http://localhost:9000` | MinIO local / URL de R2 en prod |
| `S3_BUCKET` | `chat-attachments` | |
| `WS_HEARTBEAT_INTERVAL` | `20` | Segundos entre heartbeats del cliente |
| `WS_PRESENCE_TTL` | `60` | Segundos hasta marcar offline sin heartbeat |
| `WS_TICKET_TTL` | `30` | Segundos de validez de un ticket WS de un solo uso |

---

## API REST

Base: `/api/v1`

### Auth
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `POST` | `/auth/register` | — | Registro |
| `POST` | `/auth/login` | — | Login |
| `POST` | `/auth/refresh` | — | Rotar refresh token |
| `POST` | `/auth/logout` | Bearer | Revocar refresh token |
| `GET` | `/auth/me` | Bearer | Usuario actual |
| `POST` | `/auth/verify-email/request` | Bearer | Solicitar verificación de email |
| `POST` | `/auth/verify-email/confirm` | — | Confirmar con token |
| `POST` | `/auth/password-reset/request` | — | Solicitar reset de contraseña |
| `POST` | `/auth/password-reset/confirm` | — | Confirmar con token y nueva contraseña |

### Usuarios
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/users/me` | Bearer | Perfil propio |
| `PATCH` | `/users/me` | Bearer | Actualizar perfil |
| `GET` | `/users/:id` | Bearer | Perfil de otro usuario |

### Rooms
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/rooms` | Bearer | Listar mis rooms |
| `POST` | `/rooms` | Bearer | Crear DM (`kind:"dm"`) o grupo (`kind:"group"`) |
| `GET` | `/rooms/:id` | Bearer | Detalle de room + miembros |
| `POST` | `/rooms/:id/members` | Bearer | Añadir miembro (admin/owner) |
| `DELETE` | `/rooms/:id/members` | Bearer | Eliminar miembro (admin/owner) |

### Mensajes
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/rooms/:id/messages` | Bearer | Listar (cursor: `?before=<id>&limit=<n>`) |
| `POST` | `/rooms/:id/messages` | Bearer | Enviar mensaje (fallback REST) |
| `PATCH` | `/messages/:id` | Bearer | Editar (solo el sender) |
| `DELETE` | `/messages/:id` | Bearer | Borrar (sender o admin/owner) |

### Adjuntos
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `POST` | `/attachments/presign` | Bearer | Obtener URL pre-firmada para subir |
| `GET` | `/attachments/confirm` | Bearer | Verificar que el archivo fue subido |

### WebSocket
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `POST` | `/ws/ticket` | Bearer | Emitir ticket de un solo uso (30 s) |

---

## WebSocket

### Conexión

**Opción A — JWT directo** (requiere TLS en prod, token visible en logs de proxies):
```
ws://host/ws?token=<accessToken>
```

**Opción B — ticket de un solo uso** (recomendado en prod):
```bash
# 1. Obtener ticket
POST /api/v1/ws/ticket
Authorization: Bearer <accessToken>
→ { "ticket": "uuid" }

# 2. Conectar con el ticket (expira en WS_TICKET_TTL segundos)
ws://host/ws?ticket=<ticket>
```

### Formato de mensaje (envelope)

```jsonc
// Cliente → Servidor
{ "type": "chat.send", "id": "client-ref", "payload": { ... } }

// Servidor → Cliente (confirmación)
{ "type": "ack", "refId": "client-ref", "payload": { ... } }

// Servidor → Cliente (error)
{ "type": "error", "refId": "client-ref", "payload": { "code": "...", "message": "..." } }

// Servidor → Cliente (evento push)
{ "type": "message.created", "payload": { ... }, "ts": 1234567890 }
```

### Eventos cliente → servidor

| type | payload | Descripción |
|---|---|---|
| `chat.subscribe` | `{ roomIds: string[] }` | Suscribirse a rooms |
| `chat.unsubscribe` | `{ roomIds: string[] }` | Desuscribirse |
| `chat.send` | `{ roomId, body?, attachmentKey?, clientMessageId? }` | Enviar mensaje |
| `chat.edit` | `{ messageId, body }` | Editar mensaje |
| `chat.delete` | `{ messageId }` | Borrar mensaje |
| `chat.read` | `{ roomId, messageId }` | Marcar como leído |
| `chat.typing` | `{ roomId }` | Notificar que estoy escribiendo |
| `presence.heartbeat` | — | Mantener presencia activa |
| `ping` | — | Responde `pong` |

### Eventos servidor → cliente (push)

| type | Descripción |
|---|---|
| `message.created` | Mensaje nuevo en una room suscrita |
| `message.edited` | Mensaje editado |
| `message.deleted` | Mensaje borrado (soft-delete) |
| `message.read` | Otro miembro marcó un mensaje como leído |
| `user.typing` | Un miembro está escribiendo |
| `presence.online` | Usuario conectado |
| `presence.offline` | Usuario desconectado |

---

## Tests

```bash
bun test                        # todos
bun run test:unit               # sin DB/Redis (rápidos)
bun run test:integration        # requiere docker-compose
bun run test:ws                 # fan-out cross-instancia
```

Los tests de integración requieren los servicios de docker-compose activos. Cada test trunca las tablas al terminar para aislamiento.

---

## Scripts

| Comando | Descripción |
|---|---|
| `bun run dev` | Servidor con hot-reload |
| `bun run migrate` | Aplica migraciones pendientes |
| `bun run seed` | Carga datos de prueba (dev) |
| `bash scripts/smoke.sh` | Smoke test end-to-end completo |

---

## Arquitectura

```
src/
  domain/           # Entidades, value objects, puertos (interfaces)
  application/      # Casos de uso, DTOs, servicios de dominio
  infrastructure/   # Adaptadores: HTTP, WS, DB, Redis, Storage, JWT...
  composition-root  # Wiring manual de dependencias
  create-server     # Configura Bun.serve con rutas y WS
  server            # Entry point: carga env → composition-root → serve
```

La capa `domain` no importa nada de `infrastructure`. Los casos de uso solo hablan con puertos (interfaces). Los adaptadores implementan esos puertos. El `composition-root` los conecta.

### Multi-instancia

Cada instancia comparte Postgres y Redis. Los mensajes se publican en canales `room:{roomId}` de Redis; cada instancia con suscriptores locales para ese room entrega el evento a sus conexiones WS. La presencia global usa el canal `presence:global`.

---

## Migraciones

Las migraciones son archivos SQL planos en `migrations/NNNN_*.sql`, aplicados en orden. El migrator verifica el hash SHA-256 de cada archivo ya aplicado — **no edites migraciones ya aplicadas**, crea una nueva.

```bash
bun run migrate   # aplica pendientes; no-op si todo está al día
```
