import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { createClient } from "@libsql/client";

import {
  BotAPIError,
  createAPI,
  deliver,
  feedEvents,
  handleUpdate,
  ingestFeed,
  initialize,
  state,
} from "./core.mjs";
const key = "ab".repeat(32);
const pageURL = "https://status.example.com/fa";
function feed(updates = []) {
  return {
    statusReports: [
      { id: 1, title: "اختلال API", statusReportUpdates: updates },
    ],
    maintenances: [],
  };
}
function event(id, status = "investigating") {
  return { id, status, message: "پیام وضعیت", date: "2026-09-14T12:00:00Z" };
}
function update(id, content = {}) {
  return {
    update_id: id,
    message: {
      chat: { id: 12, type: "private" },
      from: { id: 12 },
      ...content,
    },
  };
}
async function setup(t) {
  const folder = await mkdtemp(join(tmpdir(), "noqte-bot-test-"));
  const db = createClient({ url: `file:${folder}/test.db` });
  await initialize(db);
  t.after(async () => {
    db.close();
    await rm(folder, { recursive: true, force: true });
  });
  const sent = [];
  const send = async (method, payload) => {
    sent.push({ method, payload });
    return {};
  };
  const handle = (u, provider = "telegram") =>
    handleUpdate({ db, provider, update: u, send, phoneKey: key, now: 1000 });
  const enroll = async (provider = "telegram") => {
    await handle(update(1, { text: "/start" }), provider);
    await handle(
      update(2, { contact: { user_id: 12, phone_number: "+989121234567" } }),
      provider,
    );
  };
  return { db, sent, send, handle, enroll };
}
for (const provider of ["telegram", "bale"]) {
  test(`${provider}: own contact activates and encrypts; stop deletes phone`, async (t) => {
    const { db, sent, handle, enroll } = await setup(t);
    await enroll(provider);
    assert.equal(
      sent[0].payload.reply_markup.keyboard[0][0].request_contact,
      true,
    );
    let row = (await db.execute("SELECT * FROM bot_subscriber")).rows[0];
    assert.equal(row.active, 1);
    assert.ok(row.phone);
    assert.ok(!row.phone.includes("98912"));
    await handle(update(3, { text: "/stop" }), provider);
    row = (await db.execute("SELECT * FROM bot_subscriber")).rows[0];
    assert.equal(row.active, 0);
    assert.equal(row.phone, null);
  });
}
test("foreign, missing identity, forwarded contact and unsolicited contact never enroll", async (t) => {
  const { db, handle } = await setup(t);
  await handle(
    update(1, { contact: { user_id: 12, phone_number: "+989121234567" } }),
  );
  assert.equal(
    (await db.execute("SELECT * FROM bot_subscriber")).rows.length,
    0,
  );
  await handle(update(2, { text: "/start" }));
  await handle(
    update(3, { contact: { user_id: 99, phone_number: "+989121234567" } }),
  );
  await handle(update(4, { contact: { phone_number: "+989121234567" } }));
  await handle(
    update(5, {
      forward_origin: {},
      contact: { user_id: 12, phone_number: "+989121234567" },
    }),
  );
  assert.equal(
    (await db.execute("SELECT active FROM bot_subscriber")).rows[0].active,
    0,
  );
});
test("group messages ignored and persisted offset prevents duplicate handling", async (t) => {
  const { db, sent, handle } = await setup(t);
  await handle(update(1, { chat: { id: 12, type: "group" }, text: "/start" }));
  assert.equal(sent.length, 0);
  await handle(update(2, { text: "/start" }));
  await handle(update(2, { text: "/start" }));
  assert.equal(sent.length, 1);
  assert.equal(await state(db, "offset:telegram"), "3");
});
test("baseline silent, new reports and resolutions delivered once, new users get no backlog", async (t) => {
  const { db, enroll, send, sent } = await setup(t);
  await ingestFeed(db, feed([event(1)]), pageURL);
  await enroll();
  sent.length = 0;
  await ingestFeed(db, feed([event(1)]), pageURL);
  await deliver(db, { telegram: send });
  assert.equal(sent.length, 0);
  await ingestFeed(db, feed([event(1), event(2, "resolved")]), pageURL);
  await ingestFeed(db, feed([event(1), event(2, "resolved")]), pageURL);
  await deliver(db, { telegram: send });
  await deliver(db, { telegram: send });
  assert.equal(sent.length, 1);
  assert.match(sent[0].payload.text, /رفع شده/);
  assert.match(sent[0].payload.text, /events\/report\/1/);
  await enroll("bale");
  await deliver(db, { telegram: send, bale: send });
  assert.equal(sent.length, 3); // Only two enrollment replies.
});
test("transient failure persists retry, rate limit honored, successful retry drains queue", async (t) => {
  const { db, enroll, send, sent } = await setup(t);
  await ingestFeed(db, feed(), pageURL);
  await enroll();
  await ingestFeed(db, feed([event(1)]), pageURL);
  sent.length = 0;
  await deliver(
    db,
    {
      telegram: async () => {
        throw new BotAPIError(429, 60);
      },
    },
    1000,
  );
  const job = (await db.execute("SELECT * FROM bot_delivery")).rows[0];
  assert.equal(job.retry_at, 61000);
  assert.equal(job.state, "pending");
  await deliver(db, { telegram: send }, 60000);
  assert.equal(sent.length, 0);
  await deliver(db, { telegram: send }, 61001);
  assert.equal(sent.length, 1);
});
test("stop cancels pending delivery; blocked bot deactivates and removes phone", async (t) => {
  const { db, enroll, handle, send, sent } = await setup(t);
  await ingestFeed(db, feed(), pageURL);
  await enroll();
  await ingestFeed(db, feed([event(1)]), pageURL);
  await handle(update(3, { text: "/stop" }));
  sent.length = 0;
  await deliver(db, { telegram: send });
  assert.equal(sent.length, 0);
  await handle(update(4, { text: "/start" }));
  await handle(
    update(5, { contact: { user_id: 12, phone_number: "+989121234567" } }),
  );
  await ingestFeed(db, feed([event(1), event(2)]), pageURL);
  await deliver(db, {
    telegram: async () => {
      throw new BotAPIError(403);
    },
  });
  const sub = (await db.execute("SELECT * FROM bot_subscriber")).rows[0];
  assert.equal(sub.active, 0);
  assert.equal(sub.phone, null);
});
test("malformed feed rejected before baseline; maintenance and edits have stable distinct keys", async (t) => {
  const { db } = await setup(t);
  await assert.rejects(ingestFeed(db, {}, pageURL));
  assert.equal(await state(db, "feed-initialized"), undefined);
  const a = feedEvents(feed([event(1)]), pageURL);
  const b = feedEvents(feed([{ ...event(1), message: "اصلاح" }]), pageURL);
  assert.notEqual(a[0].id, b[0].id);
  const m = feedEvents(
    {
      statusReports: [],
      maintenances: [
        {
          id: 2,
          name: "نگهداری",
          message: "ارتقا",
          from: "2026-09-15T12:00:00Z",
        },
      ],
    },
    pageURL,
  );
  assert.match(m[0].message, /تعمیر و نگهداری/);
});
test("API transport targets correct provider and never leaks tokens in errors", async () => {
  for (const [provider, host] of [
    ["telegram", "api.telegram.org"],
    ["bale", "tapi.bale.ai"],
  ]) {
    const api = createAPI(provider, "secret-token", async (url, options) => {
      assert.equal(new URL(url).hostname, host);
      assert.equal(JSON.parse(options.body).timeout, 20);
      return new Response(
        JSON.stringify({
          ok: false,
          error_code: 429,
          parameters: { retry_after: 12 },
        }),
        { status: 429 },
      );
    });
    await assert.rejects(
      api("getUpdates", { timeout: 20 }),
      (e) =>
        e.code === 429 &&
        e.retryAfter === 12 &&
        !e.message.includes("secret-token"),
    );
  }
});

test("blocked enrollment reply does not poison the update queue", async (t) => {
  const { db } = await setup(t);
  await handleUpdate({
    db,
    provider: "telegram",
    update: update(1, { text: "/start" }),
    phoneKey: key,
    send: async () => {
      throw new BotAPIError(403);
    },
  });
  assert.equal(await state(db, "offset:telegram"), "2");
  assert.equal(
    (await db.execute("SELECT active FROM bot_subscriber")).rows[0].active,
    0,
  );
});

test("expired contact request is rejected", async (t) => {
  const { db, handle, send } = await setup(t);
  await handle(update(1, { text: "/start" }));
  await handleUpdate({
    db,
    provider: "telegram",
    update: update(2, {
      contact: { user_id: 12, phone_number: "+989121234567" },
    }),
    send,
    phoneKey: key,
    now: 1000000,
  });
  assert.equal(
    (await db.execute("SELECT active FROM bot_subscriber")).rows[0].active,
    0,
  );
});

test("outbox and enrollment survive client restart without historical replay", async (t) => {
  const { db, enroll, send, sent } = await setup(t);
  const file = (await db.execute("PRAGMA database_list")).rows[0].file;
  await ingestFeed(db, feed([event(1)]), pageURL);
  await enroll();
  await ingestFeed(db, feed([event(1), event(2, "resolved")]), pageURL);
  db.close();
  const reopened = createClient({ url: `file:${file}` });
  t.after(() => reopened.close());
  await initialize(reopened);
  await ingestFeed(reopened, feed([event(1), event(2, "resolved")]), pageURL);
  sent.length = 0;
  await deliver(reopened, { telegram: send });
  await deliver(reopened, { telegram: send });
  assert.equal(sent.length, 1);
  assert.equal(await state(reopened, "offset:telegram"), "3");
});
