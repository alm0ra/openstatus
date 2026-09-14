# Noqte status page

Persian status page customization for OpenStatus: RTL layout, Noqte branding, incident severity and duration, component history, and the original theme collection. The initial color scheme follows the operating system; an explicit selection is remembered.

## Setup

Run the dashboard and status-page applications with a libSQL database. Configure a page with `fa` as its default and only locale, the `default-rounded` theme, `/brand/noqte.svg` as its icon, and a custom domain. Use manual components for an incident-driven page; automated probes additionally require the upstream monitoring services and Tinybird.

Brand fonts are deployment assets and are not redistributed in this public repository. Supply licensed Dana and IRANYekanX files at the paths declared in `apps/status-page/src/app/globals.css` to reproduce the branded typography. The CSS includes system font fallbacks.

PostgreSQL is not required. Subscriber email needs Resend and a verified sender; Telegram and Bale delivery need bot credentials. The contact-sharing worker and its setup instructions live in `apps/status-bot`. Without configured bots, the interface shows them as unavailable.

## Private deployment data

Keep credentials, cluster configuration, database exports, and local operational files in the ignored `.deploy-private/`, `.local/`, or `.local-db/` directories. Use Kubernetes Secrets for runtime credentials. Do not publish local support-ticket data or import it into the public page. Production initialization should create a clean database and the intended service components, without running the destructive development seed.

## Validation

Run `pnpm verify`, the relevant package tests, and `pnpm audit --prod`. The dependency updates address known advisories; they do not constitute an application security audit. IP range matching uses `ip-address` with IPv4, IPv6, mapped-address and malformed-input coverage. Bot tests cover consent, contact identity, encryption, unsubscribe, retries and persistent delivery state.
