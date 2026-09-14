import { sentry } from "@hono/sentry";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { requestId } from "hono/request-id";

import { env } from "./env";
import { handleError } from "./libs/errors";
import { concurrencyGuard } from "./libs/middlewares/concurrency";
import { extractCredential } from "./libs/middlewares/credentials";
import { rateLimit } from "./libs/middlewares/rate-limit";
import { mcpRoute } from "./routes/mcp";
import type { Variables } from "./types";

if (
  env.NODE_ENV !== "production" ||
  env.SELF_HOST !== "true" ||
  env.MCP_STATUS_ONLY !== "true"
) {
  throw new Error(
    "MCP entrypoint requires production, SELF_HOST and MCP_STATUS_ONLY",
  );
}

const app = new Hono<{ Variables: Variables }>({ strict: false });
app.use("*", sentry({ dsn: undefined }));
app.use("*", requestId());
app.use("*", async (c, next) => {
  c.set("event", {});
  await next();
  c.header("Cache-Control", "private, no-store");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
});
app.use("*", bodyLimit({ maxSize: 64 * 1024 }));
app.use("*", ...rateLimit);
app.use("*", concurrencyGuard.middleware);
app.use("/mcp", async (c, next) => {
  const credential = extractCredential(c.req.raw.headers);
  if (!credential || !/^os_[a-f0-9]{32}$/.test(credential.token)) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const origin = c.req.header("origin");
  if (origin && origin !== env.OAUTH_ISSUER) {
    return c.json({ error: "Forbidden origin" }, 403);
  }
  await next();
});
app.onError(handleError);
app.get("/ping", (c) => c.json({ status: "ok" }));
app.route("/mcp", mcpRoute);
Deno.serve({ port: 3000 }, app.fetch);
