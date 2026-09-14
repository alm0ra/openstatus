# Noqte status bots

Telegram and Bale direct-message subscriptions for one public OpenStatus page. This is a separate Node.js worker with its own libSQL database. It consumes the public JSON feed; it does not access Noqte's application database, change OpenStatus subscribers, or require a public webhook endpoint. Email continues through OpenStatus/Resend.

## Configure

Use Node 24.12.0 and the repository's pinned pnpm. From this directory:

```sh
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Store that generated value as `BOT_PHONE_KEY`. Fill `TELEGRAM_BOT_TOKEN` and/or `BALE_BOT_TOKEN` after creating dedicated bots. Empty tokens disable the worker cleanly. Do not commit `.env` or print tokens in logs.

- `BOT_DATABASE_URL`: a **separate** libSQL/Turso database, or persistent `file:./status-bot.db` for local use.
- `BOT_DATABASE_AUTH_TOKEN`: database token when required.
- `STATUS_PAGE_URL`: public Persian page, e.g. `https://status.example.com/fa`.
- `STATUS_FEED_URL`: its JSON feed, e.g. `https://status.example.com/fa/feed/json`.
- `POLL_INTERVAL_MS`: feed polling interval, default 30 seconds, minimum 10 seconds. The upstream feed can cache for 60 seconds.

The worker creates only its own `bot_*` tables. Use one database per page. A durable database lease prevents simultaneous active worker replicas. Existing webhooks are detected and never removed automatically; dedicated bots must be configured for polling by their operator.

Start from the repository root:

```sh
pnpm --filter @openstatus/status-bot start
```

Set these public settings in `apps/status-page/.env` after the bots are ready, then restart/rebuild the frontend:

```dotenv
NEXT_PUBLIC_TELEGRAM_STATUS_BOT_URL=https://t.me/YOUR_BOT?start=status
NEXT_PUBLIC_BALE_STATUS_BOT_URL=https://ble.ir/YOUR_BOT?start=status
```

The UI has disabled placeholders until real bot URLs are configured. Bot tokens are server-only and never belong in `NEXT_PUBLIC_*` variables.

## Subscriber flow

`/start` asks for consent and offers a native **share contact** button. Only private messages, an unforwarded contact whose `user_id` matches the sender, and a contact shared within ten minutes of `/start` are accepted. A provider response without a contact identity fails closed and asks the user to use the button again; verify this on real Bale/Telegram clients during activation.

Phone numbers are encrypted with AES-256-GCM; names and raw update payloads are not persisted or logged. `/status` reports subscription state. `/stop` deactivates the subscription, deletes its encrypted phone and cancels pending notifications. Rejoining starts with future changes only.

The first successful feed fetch establishes a silent baseline before enrollment starts. Subsequent report updates (including resolved), edits and maintenance notices enter a persistent per-subscriber outbox. Content hashes prevent repeated feed polls from queuing the same update twice. Delivery retries use backoff, respect provider rate limits, and stop after ten attempts (`bot_delivery.state='failed'`). Blocking the bot (403) disables the subscription and removes its phone.

Delivery is **at least once**, not exactly once: a process failure after the provider accepts a message but before the sent marker commits can duplicate that message. Restarting does not resend the entire incident history. Only items retained in the public feed can be discovered; for a long outage, deleted or no-longer-exposed updates cannot be recovered. This integration handles public pages only and does not bypass page access controls.

Back up the bot database and `BOT_PHONE_KEY` together. Rotating the key does not rewrite existing encrypted phones. Failed deliveries require operator inspection/requeue; no hidden infinite retry or paid messaging service is enabled.

## Validation

```sh
pnpm --filter @openstatus/status-bot test
pnpm --filter @openstatus/status-bot check
```

Tests use temporary local libSQL databases and fake transports. They exercise contact ownership, encryption, cancellation, replay offsets, historical baseline suppression, new incident/resolution delivery, retries, blocking, and provider selection. No real messages are sent by tests. Live delivery requires tokens and an end-to-end check in each messenger.

API contracts: [Telegram Bot API](https://core.telegram.org/bots/api), [Bale Bot API](https://docs.bale.ai/).
