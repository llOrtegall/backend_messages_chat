import { env } from "./infrastructure/config/env.ts";
import { logger } from "./infrastructure/logging/logger.ts";
import { sql } from "./infrastructure/db/client.ts";
import { redisPublisher, redisSubscriber } from "./infrastructure/redis/client.ts";
import { buildApp } from "./composition-root.ts";
import { createServer } from "./create-server.ts";

const ctx = buildApp();
const server = createServer(ctx, env.PORT);

logger.info({ port: server.port }, "Server started");

process.on("SIGTERM", async () => {
  logger.info("SIGTERM received — shutting down");
  server.stop();
  await new Promise<void>(r => setTimeout(r, 500));
  await sql.end({ timeout: 5 });
  redisPublisher.close();
  redisSubscriber.close();
  process.exit(0);
});

export default server;
