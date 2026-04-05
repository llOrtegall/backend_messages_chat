import { env } from "./infrastructure/config/env.ts";
import { logger } from "./infrastructure/logging/logger.ts";
import { sql } from "./infrastructure/db/client.ts";
import { buildApp } from "./composition-root.ts";
import { healthHandler } from "./infrastructure/http/controllers/health-controller.ts";
import { compose } from "./infrastructure/http/compose.ts";
import { cors } from "./infrastructure/http/middlewares/cors.ts";
import { requestId } from "./infrastructure/http/middlewares/request-id.ts";
import { securityHeaders } from "./infrastructure/http/middlewares/security-headers.ts";
import { errorMapper } from "./infrastructure/http/middlewares/error-mapper.ts";
import { authMiddleware } from "./infrastructure/http/middlewares/auth.ts";
import { rateLimit } from "./infrastructure/http/middlewares/rate-limit.ts";

const { auth, tokenSigner, rateLimiter } = buildApp();

const corsM = cors(env.CORS_ORIGINS);
const authM = authMiddleware(tokenSigner);
const rlRegister = rateLimit(rateLimiter, "register", env.RATE_LIMIT_REGISTER_MAX, env.RATE_LIMIT_REGISTER_WINDOW);
const rlLogin = rateLimit(rateLimiter, "login", env.RATE_LIMIT_LOGIN_MAX, env.RATE_LIMIT_LOGIN_WINDOW);
const rlRefresh = rateLimit(rateLimiter, "refresh", env.RATE_LIMIT_REFRESH_MAX, env.RATE_LIMIT_REFRESH_WINDOW);

const base = compose(requestId, corsM, securityHeaders, errorMapper);
const baseAuth = compose(requestId, corsM, securityHeaders, errorMapper, authM);

const server = Bun.serve({
  port: env.PORT,

  routes: {
    "/health": { GET: healthHandler },
    "/ready": {
      GET: async () => {
        try {
          await sql`SELECT 1`;
          return Response.json({ status: "ok" });
        } catch {
          return Response.json({ status: "error", detail: "db unavailable" }, { status: 503 });
        }
      },
    },

    "/api/v1/auth/register": {
      POST: compose(requestId, corsM, securityHeaders, errorMapper, rlRegister)(auth.register),
    },
    "/api/v1/auth/login": {
      POST: compose(requestId, corsM, securityHeaders, errorMapper, rlLogin)(auth.login),
    },
    "/api/v1/auth/refresh": {
      POST: compose(requestId, corsM, securityHeaders, errorMapper, rlRefresh)(auth.refresh),
    },
    "/api/v1/auth/logout": {
      POST: baseAuth(auth.logout),
    },
    "/api/v1/auth/me": {
      GET: baseAuth(auth.me),
    },
    "/api/v1/auth/verify-email/request": {
      POST: baseAuth(auth.requestVerifyEmail),
    },
    "/api/v1/auth/verify-email/confirm": {
      POST: base(auth.confirmVerifyEmail),
    },
    "/api/v1/auth/password-reset/request": {
      POST: base(auth.requestPasswordReset),
    },
    "/api/v1/auth/password-reset/confirm": {
      POST: base(auth.confirmPasswordReset),
    },
  },

  fetch(req: Request): Response | Promise<Response> {
    if (req.method === "OPTIONS") {
      return compose(corsM)((_req, _ctx) => new Response(null, { status: 204 }))(req);
    }
    return Response.json({ error: "Not Found" }, { status: 404 });
  },
});

logger.info({ port: server.port }, "Server started");

process.on("SIGTERM", () => {
  logger.info("SIGTERM received — shutting down");
  server.stop(true);
  process.exit(0);
});

export default server;
