import { createClient } from "@libsql/client";

import {
  createAPI,
  deliver,
  encryptPhone,
  handleUpdate,
  ingestFeed,
  initialize,
  setState,
  state,
} from "./core.mjs";

const tokens = {
  telegram: process.env.TELEGRAM_BOT_TOKEN,
  bale: process.env.BALE_BOT_TOKEN,
};
const enabled = Object.entries(tokens).filter(([, token]) => token);
if (!enabled.length) {
  console.log(
    "Status bots disabled: set TELEGRAM_BOT_TOKEN and/or BALE_BOT_TOKEN in .env.",
  );
  process.exit(0);
}
const key = process.env.BOT_PHONE_KEY || "";
encryptPhone("validation", key);
const pageURL = new URL(process.env.STATUS_PAGE_URL);
const feedURL = new URL(process.env.STATUS_FEED_URL);
for (const url of [pageURL, feedURL]) {
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(url.hostname)
    )
  )
    throw new Error("Status URLs must use HTTPS (except localhost)");
}
const db = createClient({
  url: process.env.BOT_DATABASE_URL || "file:./status-bot.db",
  authToken: process.env.BOT_DATABASE_AUTH_TOKEN,
});
await initialize(db);
const configuredFeed = await state(db, "feed-url");
if (configuredFeed && configuredFeed !== feedURL.href)
  throw new Error("Use a separate bot database when changing status pages");
await setState(db, "feed-url", feedURL.href);
const clients = Object.fromEntries(
  enabled.map(([provider, token]) => [provider, createAPI(provider, token)]),
);
// One worker owns polling and delivery; a database lease prevents duplicate replicas.
const owner = crypto.randomUUID();
async function lease() {
  const now = Date.now();
  const result = await db.execute({
    sql: "INSERT INTO bot_state(key,value) VALUES ('worker-lease',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE CAST(substr(bot_state.value,1,13) AS INTEGER)<? OR substr(bot_state.value,15)=?",
    args: [`${now + 120000}:${owner}`, now, owner],
  });
  if (!result.rowsAffected)
    throw new Error("Another status-bot worker owns this database");
}
await lease();
for (const [provider, client] of Object.entries(clients)) {
  const info = await client("getWebhookInfo", {});
  if (info.url)
    throw new Error(
      `${provider}: an existing webhook must be removed by the operator before polling`,
    );
}
let running = true;
process.on("SIGTERM", () => {
  running = false;
});
process.on("SIGINT", () => {
  running = false;
});
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function poll(provider, send) {
  while (running) {
    try {
      await lease();
      const updates = await send("getUpdates", {
        offset: Number((await state(db, `offset:${provider}`)) || 0),
        timeout: 20,
        limit: 100,
      });
      for (const update of updates) {
        if (!running) break;
        await lease();
        await handleUpdate({ db, provider, update, send, phoneKey: key });
      }
    } catch {
      console.warn(`${provider}: polling failed; retrying`);
      await sleep(5000);
    }
  }
}
async function fetchFeed() {
  const response = await fetch(feedURL, {
    signal: AbortSignal.timeout(15000),
    redirect: "error",
  });
  if (!response.ok) throw new Error("Status feed unavailable");
  const text = await response.text();
  if (text.length > 5000000) throw new Error("Status feed too large");
  await ingestFeed(db, JSON.parse(text), pageURL.href);
}
// Baseline must exist before anyone can enroll, so old incidents never backfill.
await fetchFeed();
const interval = Math.max(10000, Number(process.env.POLL_INTERVAL_MS) || 30000);
async function notifications() {
  let nextFeed = 0;
  while (running) {
    try {
      await lease();
      if (Date.now() >= nextFeed) {
        await fetchFeed();
        nextFeed = Date.now() + interval;
      }
      await deliver(db, clients, Date.now(), lease);
    } catch {
      console.warn("Notification cycle failed; pending messages retained");
    }
    await sleep(2000);
  }
}
console.log(
  `Status bots running: ${enabled.map(([provider]) => provider).join(", ")}`,
);
await Promise.all([
  ...Object.entries(clients).map(([provider, send]) => poll(provider, send)),
  notifications(),
]);
await db.execute({
  sql: "DELETE FROM bot_state WHERE key='worker-lease' AND substr(value,15)=?",
  args: [owner],
});
db.close();
