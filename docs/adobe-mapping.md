# Adobe Translation Layer

This project is built on a free, open stack (GTM + PostHog + JSON Schema),
but every component was chosen as a **deliberate analog of the Adobe
Experience Cloud architecture**. This document is the Rosetta stone: what
each piece is here, what it's called in Adobe land, and what transfers
one-to-one versus what differs.

## Event schemas ↔ XDM

| This stack | Adobe | Notes |
|---|---|---|
| JSON Schemas in `lib/tracking/schemas/*.json` (draft-07, `additionalProperties: false`) | XDM schemas (ExperienceEvent class + field groups) | Same job: a versioned, typed contract for every event. XDM composes schemas from reusable field groups; here the shared envelope (`event_id`, `timestamp`, `consent_state`) plays the field-group role. |
| `event_id` (client UUID) | `_id` on ExperienceEvent | Both exist for exactly-once semantics downstream. |
| ajv validation in `trackEvent` (invalid payloads never ship) | AEP ingestion-time schema validation | This stack fails **client-side in dev**, Adobe fails at ingestion — failing earlier is cheaper. |
| `npm run codegen` (schemas → TypeScript, CI drift gate) | XDM schema registry as source of truth | Same principle: one contract feeding dev-time types, runtime validation, and QA assertions. |

## Tag management: GTM ↔ Data Collection (Launch)

| GTM | Adobe Launch / Tags | Notes |
|---|---|---|
| Container | Property | Unit of deployment for all tags. |
| Tag | Rule action (extension action) | The "do something" half. |
| Trigger | Rule event + conditions | The "when" half. |
| Variable / data-layer variable | Data element | Both abstract "where the value comes from" away from tags. |
| dataLayer push | `adobeDataLayer.push()` (ACDL) | Same pattern; ACDL adds computed state and event-scoped snapshots. |
| Consent Mode v2 (`gtag('consent', ...)`) | Consent extension / Adobe consent APIs (`setConsent`) | Both gate tag firing on consent state; see consent row below. |
| GTM environments (Dev/Staging/Live) + container versions | Launch environments (dev/stage/prod) + libraries/builds | Same promote-and-rollback model — see [runbook.md](runbook.md). GTM "publish version" ≈ Launch "build & promote library". |

## Capture SDK: PostHog ↔ AEP Web SDK

| This stack | Adobe | Notes |
|---|---|---|
| `posthog-js` init (consent-gated, dynamic import) | `alloy` (AEP Web SDK) configure | Single SDK for data in/out in both. |
| GTM tag forwarding dataLayer events → PostHog capture | `alloy("sendEvent", { xdm })` | Both send schema-shaped events to an edge collection endpoint. |
| `/ingest` reverse proxy (Next.js rewrites → PostHog) | First-party CNAME collection domain (Edge Network) | Same motivation: first-party context, ad-blocker resilience. |
| `bootstrap.featureFlags` from edge middleware | Web SDK response handles / server-side decisioning via Edge Network | Both eliminate the client round-trip before a decision is usable. |
| Delivery layer (`sendBeacon` on pagehide, at-least-once + `event_id` dedupe) | Web SDK's `documentUnloading` beacon handling | Same navigation-loss problem, same transport answer. |

## Profile, audiences, activation

| This stack | Adobe | Notes |
|---|---|---|
| PostHog person (distinct_id merge → person_id) | Real-Time Customer Profile (identity graph, ECID) | Identity resolution merging device ids into one profile. |
| `segment` person property (stamped client-side) | Profile attribute / computed attribute | Chain detailed in [data-model.md](data-model.md). |
| PostHog cohort (`segment = beach_intent`) | RTCDP audience | Both are person-sets built from profile attributes + behavior, consumed by activation. |
| Feature flag `personalized-hero` (multivariate by segment) | Target activity (XT/A-B) with audience targeting | The flag variant ↔ the Target experience/offer. |
| A/B holdout via flag rollout | Target A/B activity + control | Same measurement pattern. |
| `personalization_decided` event (strategy, `decided_before_paint`, latency) | Target/analytics decisioning telemetry | Emitting the decision as an event is the observability pattern this project adds explicitly. |

## Consent

| This stack | Adobe | Notes |
|---|---|---|
| Consent banner → `mtp_consent` + `gtag('consent','update',...)` | CMP → Adobe consent APIs (`setConsent`, IAB TCF strings) | Both propagate one consent signal to every downstream tool. |
| GTM consent-gated triggers; PostHog init deferred until granted | Launch rule conditions on consent; Web SDK `defaultConsent: "pending"` queues hits | Identical semantics: nothing vendor-bound fires pre-consent. The Playwright consent-gate spec asserts it here. |
| Delivery layer holds queue while pending, drops on denied | Web SDK queues events under pending consent | Same queue-until-consent model. |

## The race condition, translated

The decision-before-render problem this project is engineered around is the
same one Adobe solves:

| This stack | Adobe |
|---|---|
| Local-first segment stamp (localStorage, sync read pre-paint) | Profile-driven decisioning at the Edge; response tokens available to the page |
| Edge middleware bootstrapping flags into the HTML response | Server-side/hybrid Target (edge decisioning before render) |
| Scoped anti-flicker slot (`PersonalizedSlot`, reserved layout, 150ms cap) | Target's anti-flicker snippet (prehiding) — but scoped to the slot, never the whole page, avoiding the classic whole-page prehide penalty |
| `decided_before_paint` metric | The reason Adobe docs push the prehiding snippet + Web SDK synchronous deployment |

## What doesn't map (and knowing it matters)

- **Person-on-events** (PostHog queries person properties *as of ingestion*)
  has no direct AEP twin — Profile queries are current-state; historical
  attribution needs ExperienceEvent queries in CJA.
- **HogQL over raw events** ↔ closest is Customer Journey Analytics / Query
  Service (see [sql-analysis.md](sql-analysis.md) — those queries port almost
  verbatim to AEP Query Service, which is also SQL).
- GTM has no equivalent of Launch's **extension marketplace rules engine**
  depth; conversely Launch has no free tier — which is why this demo exists
  on GTM.
