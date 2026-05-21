<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into the DevEvent Next.js App Router project. The following changes were made:

- **`instrumentation-client.ts`** (new): Initializes PostHog client-side using the Next.js 15.3+ instrumentation approach. Configured with a reverse proxy (`/ingest`), error tracking (`capture_exceptions: true`), and debug mode in development.
- **`next.config.ts`** (updated): Added reverse proxy rewrites for `/ingest/*` and `/ingest/static/*`, `/ingest/array/*` paths routing to PostHog's US ingestion and assets endpoints. Also set `skipTrailingSlashRedirect: true`.
- **`components/ExploreBtn.tsx`** (updated): Added `posthog.capture('explore_events_clicked')` to the existing button onClick handler.
- **`components/EventCard.tsx`** (updated): Added `'use client'` directive, imported `posthog-js`, and added `posthog.capture('event_card_clicked', { title, slug, company, city, country, date, time })` on the Link's onClick.
- **`.env.local`** (new): Created with `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` and `NEXT_PUBLIC_POSTHOG_HOST` environment variables.

| Event Name | Description | File |
|---|---|---|
| `explore_events_clicked` | User clicks the "Explore Events" button on the homepage hero section | `components/ExploreBtn.tsx` |
| `event_card_clicked` | User clicks on an event card to view event details | `components/EventCard.tsx` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- [Analytics basics dashboard](https://us.posthog.com/project/433640/dashboard/1611052)
- [Explore Events button clicks over time](https://us.posthog.com/project/433640/insights/crIIP3F3)
- [Event card clicks over time](https://us.posthog.com/project/433640/insights/8l8kd6IB)
- [Unique users exploring and clicking events](https://us.posthog.com/project/433640/insights/K3XQX4jB)
- [Homepage to event card conversion funnel](https://us.posthog.com/project/433640/insights/AGVahdPR)
- [Most clicked events (by title)](https://us.posthog.com/project/433640/insights/CJqEijFY)

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
