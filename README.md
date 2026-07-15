# Martech Pipeline Project

[![CI](https://github.com/peyton150-startup/martech-pipeline-project/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/peyton150-startup/martech-pipeline-project/actions/workflows/ci.yml)

An end-to-end marketing technology pipeline built on a demo travel site:
typed dataLayer with JSON Schema validation, Google Tag Manager with consent
gating, PostHog events and feature flags, same/next-page personalization
deliberately engineered around the decision-before-render race condition, and
an automated Playwright QA harness that intercepts network calls and asserts
event payloads, ordering, and timing.

Built as a working demonstration of enterprise tag management, event
standardization, and personalization patterns (Adobe Launch / Web SDK /
Target analogs in a free, open stack).

## Stack

- Next.js (App Router, TypeScript, Tailwind) on Vercel
- GTM for tag management, PostHog for analytics + flags
- ajv + JSON Schema (draft-07) as the single source of truth for event shape
- Playwright for the QA harness

## Decision debugger

Append `?debug=1` to any URL for a live observability panel (bottom-right):
current segment, the strategy that resolved the last decision,
`decided_before_paint` + latency, per-destination engagement counts, an
expandable event log, and a timeline of the race — event fired → segment
stamped → next page rendered personalized. See
[docs/decision-debugger.md](docs/decision-debugger.md).

## Personalization signals

1. **Segment** — viewing a destination stamps `{category}_intent`; the next
   page reorders content for that category before first paint.
2. **Engagement** — every destination view and CTA click increments a
   per-destination counter; the most-interacted destination is promoted to
   the top-left card slot, where users look first.

## Reliable delivery

Personalization solves one half of the race (the decision arriving before
render); the delivery layer solves the other half (the event surviving the
navigation). Events are queued and flushed with `navigator.sendBeacon` on
`pagehide`/`visibilitychange` and `fetch(keepalive)` in the foreground, with
a localStorage-backed replay for anything that never flushed — at-least-once
delivery into an idempotent, `event_id`-deduplicating collect endpoint
(`/api/collect`). Consent-gated end to end. The Playwright harness proves it
by firing a CTA click and navigating away immediately.

## Quality gates

Every push runs [CI](.github/workflows/ci.yml):

1. **Schema → type drift gate** — `lib/tracking/types.ts` is generated from
   the JSON Schemas (`npm run codegen`); CI fails if the committed types
   drift from the schemas, so the schema stays the single contract for
   dev-time types, runtime ajv validation, and test assertions.
2. **Type-check + lint** — `tsc --noEmit` over app *and* tests, ESLint.
3. **Playwright e2e against the production build** — event payloads,
   ordering, timing (`decided_before_paint`), no-flicker, delivery.
4. **Lighthouse budget** — CLS ≤ 0.02 enforced as an error on the home and
   destination pages: quantified proof, on every commit, that
   personalization causes zero layout shift.

Pre-commit hooks (husky + lint-staged) run ESLint and `tsc --noEmit` before
a commit lands.

## Data & analysis

The pipeline's own event data is queryable and modeled:

- [SQL analysis](docs/sql-analysis.md) — real HogQL queries executed against
  this project's PostHog data: per-segment volume, view→CTA conversion,
  intent-to-action timing, an exact-once integrity check, and
  `decided_before_paint` rates measured from the field.
- [Data model & ETL](docs/data-model.md) — the raw event → profile → segment
  → cohort → flag-decision chain, plus `npm run etl`: extract events from the
  PostHog REST API, dedupe/type-cast, load into a normalized SQLite warehouse
  (`npm run etl -- --fixture` runs offline on a committed real-data sample).
- [Adobe translation layer](docs/adobe-mapping.md) — how every piece maps
  onto Adobe Experience Cloud: schemas ↔ XDM, GTM ↔ Launch, PostHog ↔ AEP
  Web SDK, cohorts ↔ RTCDP audiences, flags ↔ Target.

## Operations

- [Runbook](docs/runbook.md) — deploy, GTM Dev/Staging/Live publish +
  rollback, post-deploy event verification, production validation with
  browser tools, Playwright triage, and the add-a-new-event procedure.

## Docs

- [Architecture](docs/architecture.md)
- [Decision debugger](docs/decision-debugger.md)
- [Race condition & strategies](docs/race-condition.md)
- [Data model & ETL](docs/data-model.md)
- [SQL analysis](docs/sql-analysis.md)
- [Adobe mapping](docs/adobe-mapping.md)
- [Runbook](docs/runbook.md)
- [Naming conventions](docs/naming-conventions.md)

## Run it

```bash
npm install
npm run dev
```

Set `NEXT_PUBLIC_GTM_ID` in `.env.local` once the GTM container exists.
For PostHog, copy `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST`
from `.env.example` into `.env.local` (the `phc_` key is a public
client-side token).
