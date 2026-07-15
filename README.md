# Martech Pipeline Project

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

## Docs

- [Architecture](docs/architecture.md)
- [Decision debugger](docs/decision-debugger.md)
- [Race condition & strategies](docs/race-condition.md)
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
