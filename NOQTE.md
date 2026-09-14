# Noqte status page

Persian status page customization for OpenStatus: RTL layout, Noqte branding, incident severity and duration, component history, and the original theme collection. The initial color scheme follows the operating system; an explicit selection is remembered.

Deployment instructions: [راهنمای استقرار](DEPLOYING.md).

## Setup

Run the dashboard and status-page applications with a libSQL database. Configure a page with `fa` as its default and only locale, the `default-rounded` theme, `/brand/noqte.svg` as its icon, and a custom domain. Use manual components for an incident-driven page; automated probes additionally require the upstream monitoring services and Tinybird.

Brand fonts are deployment assets and are not redistributed in this public repository. Supply licensed Dana and IRANYekanX files at the paths declared in `apps/status-page/src/app/globals.css` to reproduce the branded typography. The CSS includes system font fallbacks.

PostgreSQL is not required. Subscriber email needs Resend and a verified sender; Telegram and Bale delivery need bot credentials. The contact-sharing worker and its setup instructions live in `apps/status-bot`. Without configured bots, the interface shows them as unavailable.

## Private deployment data

Keep credentials, cluster configuration, database exports, and local operational files in the ignored `.deploy-private/`, `.local/`, or `.local-db/` directories. Use Kubernetes Secrets for runtime credentials. Do not publish local support-ticket data or import it into the public page. Production initialization should create a clean database and the intended service components, without running the destructive development seed.

## Validation

Run `pnpm verify`, the relevant package tests, and `pnpm audit --prod`. The dependency updates address known advisories; they do not constitute an application security audit. IP range matching uses `ip-address` with IPv4, IPv6, mapped-address and malformed-input coverage. Bot tests cover consent, contact identity, encryption, unsubscribe, retries and persistent delivery state.

## Single-admin dashboard

For an isolated self-hosted administrator, set `AUTH_ADMIN_ENABLED=true`, bind `AUTH_ADMIN_USER_ID` to an existing workspace owner, and supply `AUTH_ADMIN_PASSWORD_HASH` through a runtime Secret. The username is `admin`; there is no public registration or password-reset endpoint in this mode. Use a separate `AUTH_SECRET` and hostname from the public page. Sessions use encrypted JWTs with an eight-hour lifetime.

The password format is `scrypt:<32-byte salt in hex>:<64-byte key in hex>` with N=32768, r=8, p=1. Generate a strong random password privately. Rotate the session secret with the password to invalidate existing sessions. Login attempts are capped in-process; add ingress rate limiting on the Auth.js callback routes. Run one admin replica unless a shared rate limiter is configured. Never place the password, hash, or session secret in public configuration.

Production email sign-in uses the configured provider and never prints magic links. Development-only link logging remains available for local development.
