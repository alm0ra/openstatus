import { createCipheriv, createHash, randomBytes } from "node:crypto";

export const PROVIDERS = {
  telegram: "https://api.telegram.org",
  bale: "https://tapi.bale.ai",
};
const labels = {
  investigating: "در حال بررسی",
  identified: "شناسایی شده",
  monitoring: "در حال پایش",
  resolved: "رفع شده",
  maintenance: "تعمیر و نگهداری",
};
const removeKeyboard = { remove_keyboard: true };

export class BotAPIError extends Error {
  constructor(code, retryAfter = 0) {
    super(`Bot API error ${code}`);
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

export function createAPI(provider, token, request = fetch) {
  if (!PROVIDERS[provider] || !token)
    throw new Error("Bot configuration missing");
  return async (method, payload) => {
    let response;
    try {
      response = await request(`${PROVIDERS[provider]}/bot${token}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(35000),
      });
    } catch {
      throw new BotAPIError(503);
    }
    let data;
    try {
      data = await response.json();
    } catch {
      throw new BotAPIError(502);
    }
    if (!response.ok || !data.ok)
      throw new BotAPIError(
        data.error_code || response.status,
        data.parameters?.retry_after || 0,
      );
    return data.result;
  };
}

export function encryptPhone(phone, keyHex) {
  if (!/^[a-f\d]{64}$/i.test(keyHex))
    throw new Error("BOT_PHONE_KEY must be 32 random bytes in hex");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), iv);
  const encrypted = Buffer.concat([
    cipher.update(phone, "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}

export async function initialize(db) {
  await db.batch(
    [
      `CREATE TABLE IF NOT EXISTS bot_state (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS bot_subscriber (provider TEXT NOT NULL, chat TEXT NOT NULL, phone TEXT, active INTEGER NOT NULL DEFAULT 0, pending_until INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(provider,chat))`,
      `CREATE TABLE IF NOT EXISTS bot_event (id TEXT PRIMARY KEY, message TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS bot_delivery (provider TEXT NOT NULL, chat TEXT NOT NULL, event_id TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, retry_at INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(provider,chat,event_id))`,
      `CREATE INDEX IF NOT EXISTS bot_delivery_pending ON bot_delivery(state,retry_at)`,
    ],
    "write",
  );
}

export async function state(db, key) {
  return (
    await db.execute({
      sql: "SELECT value FROM bot_state WHERE key=?",
      args: [key],
    })
  ).rows[0]?.value;
}
export async function setState(db, key, value) {
  await db.execute({
    sql: "INSERT INTO bot_state VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    args: [key, String(value)],
  });
}

export async function stopSubscription(db, provider, chat) {
  await db.batch(
    [
      {
        sql: "UPDATE bot_subscriber SET active=0, phone=NULL, pending_until=0 WHERE provider=? AND chat=?",
        args: [provider, chat],
      },
      {
        sql: "UPDATE bot_delivery SET state='cancelled' WHERE provider=? AND chat=? AND state='pending'",
        args: [provider, chat],
      },
    ],
    "write",
  );
}

export async function handleUpdate({
  db,
  provider,
  update,
  send,
  phoneKey,
  now = Date.now(),
}) {
  if (!Number.isSafeInteger(update.update_id) || update.update_id < 0) return;
  if (update.update_id < Number((await state(db, `offset:${provider}`)) || 0))
    return;
  const m = update.message;
  if (
    m?.chat?.type === "private" &&
    Number.isSafeInteger(m.chat.id) &&
    Number.isSafeInteger(m.from?.id) &&
    !m.from.is_bot
  ) {
    const chat = String(m.chat.id);
    const text = m.text?.trim();
    const command = text?.split(/\s+/)[0];
    let reply;
    let keyboard = removeKeyboard;
    if (command === "/stop" || text === "لغو اشتراک") {
      await stopSubscription(db, provider, chat);
      reply =
        "اشتراک شما لغو و شمارهٔ ذخیره‌شده حذف شد. برای عضویت دوباره /start را بفرستید.";
    } else if (command === "/start") {
      await db.execute({
        sql: "INSERT INTO bot_subscriber(provider,chat,pending_until) VALUES (?,?,?) ON CONFLICT(provider,chat) DO UPDATE SET pending_until=excluded.pending_until",
        args: [provider, chat, now + 600000],
      });
      reply =
        "برای دریافت خبرهای اختلال و رفع آن در نقطه، مخاطب خود را با دکمهٔ زیر به اشتراک بگذارید. شمارهٔ شما برای این اشتراک ذخیره می‌شود. لغو و حذف شماره: /stop";
      keyboard = {
        keyboard: [
          [{ text: "اشتراک‌گذاری مخاطب و عضویت", request_contact: true }],
        ],
        resize_keyboard: true,
        one_time_keyboard: true,
      };
    } else if (m.contact) {
      const subscriber = (
        await db.execute({
          sql: "SELECT pending_until FROM bot_subscriber WHERE provider=? AND chat=?",
          args: [provider, chat],
        })
      ).rows[0];
      const phone = String(m.contact.phone_number || "").replace(
        /[\s()-]/g,
        "",
      );
      if (!subscriber || Number(subscriber.pending_until) < now) {
        reply =
          "ابتدا /start را بفرستید و از دکمهٔ اشتراک‌گذاری مخاطب استفاده کنید.";
      } else if (
        m.contact.user_id !== m.from.id ||
        m.forward_origin ||
        m.forward_from ||
        m.forward_date ||
        !/^\+?\d{7,15}$/.test(phone)
      ) {
        reply =
          "فقط مخاطب متعلق به خودتان پذیرفته می‌شود. /start را بفرستید و دکمهٔ اشتراک‌گذاری مخاطب را بزنید.";
      } else {
        await db.execute({
          sql: "UPDATE bot_subscriber SET phone=?,active=1,pending_until=0 WHERE provider=? AND chat=?",
          args: [encryptPhone(phone, phoneKey), provider, chat],
        });
        reply =
          "عضویت شما فعال شد. خبرهای جدید اختلال و رفع آن همین‌جا ارسال می‌شود. لغو اشتراک: /stop";
      }
    } else if (command === "/status") {
      const sub = (
        await db.execute({
          sql: "SELECT active FROM bot_subscriber WHERE provider=? AND chat=?",
          args: [provider, chat],
        })
      ).rows[0];
      reply = sub?.active
        ? "اشتراک شما فعال است. لغو اشتراک: /stop"
        : "اشتراکی ندارید. برای عضویت /start را بفرستید.";
    }
    if (reply) {
      try {
        await send("sendMessage", {
          chat_id: chat,
          text: reply,
          reply_markup: keyboard,
        });
      } catch (error) {
        if (!(error instanceof BotAPIError) || error.code !== 403) throw error;
        await stopSubscription(db, provider, chat);
      }
    }
  }
  await setState(db, `offset:${provider}`, update.update_id + 1);
}

export function feedEvents(feed, pageURL) {
  if (!Array.isArray(feed?.statusReports) || !Array.isArray(feed?.maintenances))
    throw new Error("Invalid status feed");
  const events = [];
  const add = (id, title, status, message, date, path) => {
    if (
      typeof title !== "string" ||
      typeof message !== "string" ||
      !labels[status] ||
      !Number.isFinite(Date.parse(date))
    )
      throw new Error("Invalid feed event");
    const link = `${pageURL.replace(/\/$/, "")}/${path}`;
    const text = `نقطه · ${labels[status]}\n${title.slice(0, 250)}\n\n${message.slice(0, 2600)}\n\n${new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tehran" }).format(new Date(date))} (تهران)\n${link}\n\nلغو اشتراک: /stop`;
    const hash = createHash("sha256")
      .update(JSON.stringify([title, status, message, date]))
      .digest("hex");
    events.push({ id: `${id}:${hash}`, message: text, date: Date.parse(date) });
  };
  for (const report of feed.statusReports) {
    if (
      !Number.isSafeInteger(report.id) ||
      !Array.isArray(report.statusReportUpdates)
    )
      throw new Error("Invalid report");
    for (const update of report.statusReportUpdates) {
      if (!Number.isSafeInteger(update.id)) throw new Error("Invalid update");
      add(
        `report:${update.id}`,
        report.title,
        update.status,
        update.message,
        update.date,
        `events/report/${report.id}`,
      );
    }
  }
  for (const m of feed.maintenances) {
    if (!Number.isSafeInteger(m.id)) throw new Error("Invalid maintenance");
    add(
      `maintenance:${m.id}`,
      m.name,
      "maintenance",
      m.message,
      m.updatedAt || m.from,
      `events/maintenance/${m.id}`,
    );
  }
  return events.sort((a, b) => a.date - b.date);
}

export async function ingestFeed(db, feed, pageURL) {
  const events = feedEvents(feed, pageURL);
  const tx = await db.transaction("write");
  try {
    const baseline = await state(tx, "feed-initialized");
    for (const event of events) {
      const inserted = await tx.execute({
        sql: "INSERT OR IGNORE INTO bot_event VALUES (?,?)",
        args: [event.id, event.message],
      });
      if (baseline && inserted.rowsAffected) {
        await tx.execute({
          sql: "INSERT OR IGNORE INTO bot_delivery(provider,chat,event_id) SELECT provider,chat,? FROM bot_subscriber WHERE active=1",
          args: [event.id],
        });
      }
    }
    await setState(tx, "feed-initialized", "1");
    await tx.commit();
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    tx.close();
  }
}

export async function deliver(
  db,
  clients,
  now = Date.now(),
  assertLease = async () => {},
) {
  const jobs = (
    await db.execute({
      sql: `SELECT d.*,e.message FROM bot_delivery d JOIN bot_event e ON e.id=d.event_id JOIN bot_subscriber s ON s.provider=d.provider AND s.chat=d.chat WHERE d.state='pending' AND d.retry_at<=? AND s.active=1 ORDER BY d.rowid LIMIT 20`,
      args: [now],
    })
  ).rows;
  for (const job of jobs) {
    const send = clients[job.provider];
    if (!send) continue;
    if (Number((await state(db, `cooldown:${job.provider}`)) || 0) > now)
      continue;
    await assertLease();
    const args = [job.provider, job.chat, job.event_id];
    const live = await db.execute({
      sql: "SELECT 1 FROM bot_subscriber s JOIN bot_delivery d ON d.provider=s.provider AND d.chat=s.chat WHERE s.provider=? AND s.chat=? AND d.event_id=? AND s.active=1 AND d.state='pending'",
      args,
    });
    if (!live.rows.length) continue;
    try {
      await send("sendMessage", { chat_id: job.chat, text: job.message });
      await db.execute({
        sql: "UPDATE bot_delivery SET state='sent' WHERE provider=? AND chat=? AND event_id=?",
        args,
      });
    } catch (error) {
      if (error instanceof BotAPIError && error.code === 403) {
        await stopSubscription(db, job.provider, job.chat);
      } else {
        const attempts = Number(job.attempts) + 1;
        const wait = Math.max(
          1000 * Math.min(3600, 2 ** attempts * 10),
          (error.retryAfter || 0) * 1000,
        );
        await db.execute({
          sql: "UPDATE bot_delivery SET attempts=?,retry_at=?,state=? WHERE provider=? AND chat=? AND event_id=?",
          args: [
            attempts,
            now + wait,
            attempts >= 10 ? "failed" : "pending",
            ...args,
          ],
        });
        if (error.code === 429) {
          await setState(db, `cooldown:${job.provider}`, now + wait);
          break;
        }
      }
    }
  }
}
