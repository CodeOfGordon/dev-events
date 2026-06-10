# Architectural Decision Record

Each entry: **Context → Decision → Rationale → Consequences**. Newest decisions append to the bottom. Agents log new architectural choices here (per `AGENTS.md` handoff protocol).

---

## ADR-001 — Database: MongoDB + Mongoose
**Status**: Accepted · 2026-06-08

**Context**: The prefilled `AGENTS.md`/`SKILLS.md`/`gotchas.md` described Supabase (Postgres + RLS), but the repo already contained working Mongoose models (`database/event.model.ts`, `database/booking.model.ts`) and a cached connection (`database/mongodb.ts`). The two had to be reconciled.

**Decision**: Standardize on **MongoDB + Mongoose**. Drop Supabase/Postgres. Install the official **MongoDB MCP server** (`mongodb-mcp-server`) for schema/query/migration tooling.

**Rationale**:
- Working code already exists — choosing Mongo discards nothing; choosing Supabase would mean rewriting validated models, hooks, and indexes.
- Scraped events are **heterogeneous** across sources (fields present on Luma differ from Eventbrite, MLH, company pages). A document model absorbs that variance without rigid migrations.
- Dedup is a natural `updateOne({ fingerprint }, …, { upsert: true })` — no join/constraint gymnastics.
- Mongoose pre-save hooks already perform slug/date/time normalization — exactly the normalizer-agent's job.
- Atlas free tier (M0) + Atlas Search cover hosting and full-text.

**Consequences**: Full-text search uses a Mongoose `text` index (or Atlas Search `$search`) rather than Postgres FTS. No RLS — booking/auth rules are enforced in app/server code. The `date` field is stored as a `YYYY-MM-DD` **string**, so date-range filters rely on lexical comparison (works because the format sorts lexically). Alternatives rejected: **Supabase** (rewrite cost, weaker fit for heterogeneous data), **Prisma** (adds an ORM layer with no clear benefit here; Prisma+Mongo loses some Mongo features).

---

## ADR-002 — Repository structure consolidated under `.claude/`
**Status**: Accepted · 2026-06-08

**Decision**: Agent knowledge lives under `.claude/`:
- `.claude/skills/<name>/SKILL.md` — 9 invokable Claude Code skills (auto-discovered via frontmatter).
- `.claude/docs/{CONTEXT,decisions,gotchas,REFERENCES}.md` — knowledge docs.
- `.claude/skills/README.md` — skills index.
- `.mcp.json` (repo root) — MCP server config.
- `AGENTS.md` + `CLAUDE.md` stay at repo root (`CLAUDE.md` imports `@AGENTS.md`).

**Rationale**: Real skills (vs plain reference `.md`) are auto-surfaced and invokable, matching the existing PostHog skill at `.claude/skills/integration-nextjs-app-router/`. Grouping docs keeps the repo root clean.

**Consequences**: The old root `SKILLS.md` and `gotchas.md` were superseded by `.claude/skills/README.md` and `.claude/docs/gotchas.md` and removed. `AGENTS.md` handoff paths were updated to the `.claude/` locations.

---

## ADR-003 — MCP server set
**Status**: Accepted · 2026-06-08

**Decision**: `.mcp.json` declares five servers (verified package names/commands as of 2026-06-08):

| Server | Command | Secret (env) | Notes |
|---|---|---|---|
| `mongodb` | `npx -y mongodb-mcp-server@latest --readOnly` | `MDB_MCP_CONNECTION_STRING` | `--readOnly` blocks writes; remove to allow migrations. Same value as `MONGODB_URI`. |
| `apify` | `npx -y @apify/actors-mcp-server --tools actors,docs` | `APIFY_TOKEN` | Replaces deprecated `--actors` flag. Hosted alt: `https://mcp.apify.com`. |
| `playwright` | `npx -y @playwright/mcp@latest --headless --isolated` | — | First run downloads browsers: `npx playwright install chromium`. |
| `fetch` | `uvx mcp-server-fetch` | — | **Python** server — needs `uv` installed (not npm). |
| `brave-search` | `npx -y @brave/brave-search-mcp-server --transport stdio` | `BRAVE_API_KEY` | Current package; replaces deprecated `@modelcontextprotocol/server-brave-search`. |

**Consequences**: No Supabase MCP. `apify`/`brave-search` need paid-ish keys (Brave has a free ~2k/mo tier); `fetch` needs `uv`; `playwright` needs a one-time browser download. App + MCP read secrets from `.env.local` (template `.env.example`).

---

## ADR-004 — Scraping strategy (tool per source)
**Status**: Accepted · 2026-06-08

**Decision**: Pick the cheapest tool that works per source:
- **Apify actors** → Luma (`mhamas/luma-calendar-events-scraper`), Eventbrite (`parseforge/eventbrite-scraper`, city slug form `toronto--ontario`), Meetup (`easyapi/meetup-events-scraper`).
- **fetch MCP** → static HTML (mlh.io/seasons, communitech.ca/events, hackathons.ca).
- **Playwright MCP** → JS-heavy company pages (AWS, Databricks, GDG/Bevy, RBC).
- **Brave Search MCP** → discover event URLs before scraping ("[company] Toronto developer event").

Scrapers emit **raw JSON only**; the normalizer-agent converts raw → canonical `Event`.

**Consequences**: Apify REST uses async run + poll (`waitForFinish`), Bearer auth, `maxItems` capped during dev to protect free-tier credits. See `.claude/skills/event-scraping/` and `.claude/skills/apify-actors/`.

---

## ADR-005 — Deduplication via content fingerprint
**Status**: Accepted · 2026-06-08

**Decision**: `fingerprint = sha256( lowercased trimmed title + "|" + date(YYYY-MM-DD) + "|" + lowercased city )`. **Time is excluded** (sources disagree by minutes). Upsert on `fingerprint` via `updateOne(..., { upsert: true })` / `bulkWrite`; `fingerprint` gets a **unique sparse** index.

**Consequences**: The same event on multiple platforms collapses to one document. E11000 races are handled idempotently. Merge policy: keep the richest description, prefer the source carrying the canonical `url`. See `.claude/skills/deduplication/`.

---

## ADR-006 — Calendar export: `add-to-calendar-button-react`
**Status**: Accepted · 2026-06-08

**Decision**: Use `add-to-calendar-button-react` (Web Component wrapper) inside a `"use client"` component. Map `Event.date → startDate` (YYYY-MM-DD), `Event.time → startTime` (HH:MM), `Event.timezone → timeZone` (IANA). Supports Google/Outlook/Apple/Yahoo/iCal with **no backend and no OAuth**.

**Consequences**: SSR/hydration handled via client-only mount (`dynamic(..., { ssr: false })`). A hand-built Google-URL + `.ics` blob is documented as a fallback. See `.claude/skills/calendar-button/`.

---

## ADR-007 — Scheduling: cron → `POST /api/refresh`
**Status**: Accepted · 2026-06-08

**Decision**: A nightly cron (Vercel Cron via `vercel.json`, or a GitHub Actions scheduled workflow) calls `POST /api/refresh`, guarded by `CRON_SECRET` in the `Authorization` header. The endpoint runs the scrape → normalize → upsert pipeline and busts the events-feed cache.

**Consequences**: Vercel free-tier cron is once-daily minimum; use GitHub Actions for finer cadence. See `.claude/skills/scheduling/`.

---

## ADR-008 — Event schema extensions for aggregation
**Status**: Accepted · 2026-06-08

**Context**: The existing `Event` model was built for hand-authored events; scraped events need provenance and dedup fields, and can't always supply every current required field.

**Decision**: Extend the Mongoose `Event` model with: `url` (canonical source link — required for this product), `source`, `sourceId`, `fingerprint` (unique sparse), `timezone` (IANA, default `America/Toronto`), optional `endDate`/`endTime`, `isFree`/`price`, and `category` (enum `hackathon | meetup | conference | networking`). **Relax** requireds that scraped sources often lack (`overview`, `agenda`, `audience`). (Field name is `category` — single canonical name, matching CONTEXT.md §6 and the `data-schema` skill; do not introduce a parallel `eventType`.)

**Consequences**: A schema migration/update to `database/event.model.ts` is pending implementation. See `.claude/skills/data-schema/`.

---

## ADR-009 — Luma via its direct public JSON API (supersedes the ADR-004 Luma actor)
**Status**: Accepted · 2026-06-10

**Context**: ADR-004 picked the `mhamas/luma-calendar-events-scraper` Apify actor (72% success rate, 26 users). While verifying it, `api.lu.ma` turned out to answer unauthenticated JSON for everything we need.

**Decision**: Scrape Luma directly: `GET api.lu.ma/url?url=<slug>` resolves a slug to a **discover-place** (toronto, montreal) or **calendar** (ottawa, company calendars); then `discover/get-paginated-events?discover_place_api_id=…` / `calendar/get-items?calendar_api_id=…&period=future` return full event entries (event + calendar + hosts + ticket_info). No Apify, no credits, ~2 s for all cities.

**Consequences**: Free and fast; the biggest-volume source costs nothing nightly. It is an *unofficial* API — if Luma locks it down, fall back to the ADR-004 actor (the fetcher interface hides the mechanism). Luma's robots.txt only restricts Googlebot on a few paths. List entries carry no description — `normalizeRawEvent` synthesizes one (schema requires it).

---

## ADR-010 — Company sources: provider-agnostic registry, not per-company scrapers
**Status**: Accepted · 2026-06-10

**Context**: The user wants company dev-event pages (AI labs, big tech, banks) covered, but company-site scrapers rot fast and most companies have no stable feed.

**Decision**: `company` is a **registry** (`lib/fetchers/config.ts` → `COMPANY_SOURCES`): each entry maps a company to one of the generic **provider adapters** in `lib/fetchers/company.ts` — currently `luma` (any company Luma calendar, e.g. Cohere `cal-400NOkbFqzrkJNA`, Notion Toronto `notiontoronto`) and `tribe` (any WordPress site running The Events Calendar, e.g. Vector Institute). Adding a company on a supported platform is one config line; a new platform is one adapter.

**Investigated and skipped**: GDG/Bevy (`gdg.community.dev` robots.txt disallows `/api/` for all agents; pages are a JS SPA), Microsoft Reactor (JS-only SPA, unstable), Shopify/Notion-corp/banks incl. Capital One, RBC/Borealis, TD (no public dev-events feed — their events surface on the Luma/Eventbrite/Meetup city feeds, which we already scrape). Mila (Drupal, no structured feed; Montreal covered by city feeds).

**Consequences**: Quality over quantity — `company` only carries sources that won't silently rot. The amber "Company" treatment in the UI keys off `source === 'company'`.

---

## ADR-011 — Region set: GTA + Ottawa + Montreal + Quebec City
**Status**: Accepted · 2026-06-10

City slugs/queries per source live in `lib/fetchers/config.ts`: Luma (toronto, montreal, ottawa — no Quebec City discovery page exists), Eventbrite (`canada--toronto`, `canada--mississauga`, `canada--ottawa`, `canada--montreal`), Meetup (Toronto, Ottawa, Montréal, Québec), MLH (all Ontario/Quebec + digital). `normalize.ts` canonicalizes spellings (Montréal→Montreal, Québec→Quebec City) so filters and fingerprints agree across sources.

---

## ADR-012 — Frontend reads Mongo directly in server components
**Status**: Accepted · 2026-06-10

Pages query Mongoose via `lib/events.ts` (returns plain serializable `EventDoc`s) instead of fetching `/api/events` over HTTP — no self-HTTP hop; the API route stays as the external surface with identical filter semantics. Event images render via plain `<img>` with an error fallback (`components/EventImage.tsx`) because scraped image hosts are arbitrary and `next/image` `remotePatterns` can't enumerate them.

---

## Known follow-ups / tech debt
- ~~`database/mongodb.ts` stray `v8` import~~ — already removed.
- ~~`normalizeDate()` UTC day-shift~~ — **fixed 2026-06-10**: `normalizeDate`/`normalizeTime` extract wall-clock parts in the event's IANA timezone (`Intl.DateTimeFormat`); `event.model.ts` reuses the same helpers.
- 8 stale Atlas docs predate the city/entity normalization fixes (city `Montréal`, one `&#8211;` title) — delete or let them age out; re-scrapes create the canonical versions.
- Meetup fetcher is the one source not yet live-verified end-to-end (Apify free credit exhausted mid-validation; item shape + plumbing verified — see gotchas).
