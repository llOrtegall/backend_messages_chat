import type { Middleware } from "../compose.ts";
import { env } from "../../config/env.ts";

export const securityHeaders: Middleware = async (req, ctx, next) => {
  const res = await next();
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  if (env.NODE_ENV === "production") {
    res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  return res;
};
