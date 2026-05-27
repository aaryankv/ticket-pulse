# Ticket Pulse

Ticket Pulse is a production-style internal operations platform for tracking linked Support Oracle, Bug Oracle, and Jira work across engineering teams.

It starts with mock adapters so the system can be developed safely before enterprise API access is available. The integration boundary is intentionally pluggable: each external system has an adapter with `authenticate`, `fetchTicket`, `fetchComments`, and `normalizeResponse`.

## Stack

- Next.js 15, React, TypeScript
- TailwindCSS and shadcn/ui-style primitives
- PostgreSQL with Prisma ORM
- NextAuth-ready authentication
- Node background polling with node-cron, with BullMQ dependencies included for Redis-backed scaling
- Email and Slack notifications
- Jest and Playwright
- Docker and docker-compose

The compose stack exposes `frontend`, `backend`, `postgres`, and `redis` services. In this Next.js implementation the frontend service also serves API routes, while the backend service runs the polling worker.

## Getting Started

1. Copy `.env.example` to `.env` and update secrets.
2. Start Postgres and Redis:

```bash
docker compose up postgres redis
```

3. Install dependencies:

```bash
npm install
```

4. Apply the database schema:

```bash
npm run db:migrate
```

5. Start the web app:

```bash
npm run dev
```

6. Start the polling worker in a second terminal:

```bash
npm run worker
```

## Phases

Phase 1 covers auth, database, dashboard, and manual ticket entry.

Phase 2 adds polling, change detection, notifications, and ticket history.

Phase 3 adds weekly reports, analytics, and admin views.

Phase 4 swaps mock adapters for real enterprise integrations, SSO, and queue-based scaling.

## Enterprise API Integration

The mock adapters live under `services/supportOracle`, `services/bugOracle`, and `services/jira`. Replace the TODO sections in those adapters with real API clients when endpoints and auth flows are available. Do not store external raw passwords. Store OAuth tokens or API tokens encrypted with `EXTERNAL_TOKEN_ENCRYPTION_KEY`.

## Useful Commands

```bash
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run worker
```

## Oracle SSO And Enterprise Links

Ticket Pulse now recognizes the SSO-protected Oracle URLs used by support engineers:

- Oracle Support portal: `https://support.oracle.com/support/?page=sptemplate&sptemplate=service-request`
- Oracle Support SR deep link: `https://support.oracle.com/support/?SR=4-0002701146&page=sptemplate&sptemplate=sr-activities`
- Oracle Jira portal: `https://jira.oraclecorp.com/`
- Oracle Jira issue deep link: `https://jira.oraclecorp.com/jira/browse/OFCL-35376`
- Bug Oracle portal: `https://bug.oraclecorp.com/ords/bug/bugui/home`
- Bug Oracle record deep link: `https://bug.oraclecorp.com/pls/bug/webbug_edit.edit_info_top?rptno=39342735`

The UI can accept either bare IDs or pasted URLs. Links open in a new tab and rely on the engineer's browser SSO session. When PostgreSQL is unavailable in local development, ticket creation falls back to `.local-data/tickets.json`; production should use PostgreSQL.

For app login, configure `ORACLE_SSO_ISSUER`, `ORACLE_SSO_CLIENT_ID`, and `ORACLE_SSO_CLIENT_SECRET` to enable the optional `oracle-sso` OIDC provider in NextAuth.

Automatic polling now has three modes controlled by `ENTERPRISE_FETCH_MODE`:

- `auto`: use live Oracle/Jira fetches when a delegated Oracle SSO/API token exists, otherwise use mock data in demo mode.
- `live`: require Oracle SSO/API tokens and report an auth-required ticket event when a system is not connected.
- `mock`: always use mock adapters for local development.

A Ticket Pulse app login cannot magically reuse browser cookies from `support.oracle.com`, `jira.oraclecorp.com`, or `bug.oraclecorp.com`. For automatic checks, the worker needs either the Oracle SSO access token issued through the `oracle-sso` provider or an encrypted per-system API token in `ExternalCredential`. The worker should not store raw external passwords.


## Local Browser Tracker

For Oracle pages that already open after unified login in your normal browser, Ticket Pulse includes a local Playwright-based tracker. It can attach to Microsoft Edge through a localhost debugging endpoint, open Oracle Support, Jira, and Bug Oracle pages, read visible status fields, store snapshots, and trigger the same change detection and notifications as API polling.

1. Start or attach the Edge session:

```bash
npm run browser:connect
```

2. Keep automatic browser tracking running:

```bash
npm run browser:worker
```

3. Refresh one tracked ticket through the browser path:

```bash
npm run browser:refresh -- <tracked-ticket-id>
```

You can also open Settings in the app and click `Connect Oracle session`. Keep the Edge window that was started with the local debugging port open; Ticket Pulse will attach to that existing Edge profile and will not launch another Edge window when `BROWSER_CDP_LAUNCH="false"`.

Useful environment values:

```bash
BROWSER_CDP_URL="http://127.0.0.1:9222"
BROWSER_CDP_LAUNCH="false"
EDGE_PROFILE_DIRECTORY="Default"
BROWSER_PROFILE_DIR=".oracle-browser-profile"
BROWSER_HEADLESS="false"
BROWSER_CHANNEL="msedge"
BROWSER_EXECUTABLE_PATH=""
BROWSER_SESSION_CONNECT_MINUTES="20"
BROWSER_WORKER_INTERVAL_MINUTES="30"
PLAYWRIGHT_BROWSER_CHANNEL="msedge"
```

Ticket Pulse defaults to Microsoft Edge attach mode. If Edge channel detection fails, set `EDGE_EXECUTABLE_PATH` to the Edge executable, for example `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`.