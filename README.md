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

## Docs

- [Architecture](docs/architecture.md)
- [Naming conventions](docs/naming-conventions.md)

## Run it

```bash
npm install
npm run dev
```

Set `NEXT_PUBLIC_GTM_ID` in `.env.local` once the GTM container exists.
