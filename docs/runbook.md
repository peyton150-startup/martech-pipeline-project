# Runbook

Operational procedures for the Wayfarer martech pipeline. Checklist-style —
each section is meant to be followed top to bottom during the operation it
covers. Architecture background lives in [architecture.md](architecture.md);
this document is about *doing*.

---

## 1. Deploy the site

1. Confirm CI is green on `main` (the badge in the README, or Actions → CI).
   CI gates: schema→type drift, `tsc`, ESLint, production build, Playwright
   e2e against the production server, Lighthouse CLS budget.
2. Vercel deploys `main` automatically. For a manual/first deploy:
   `npx vercel --prod` from a clean checkout of `main`.
3. Required environment variables (Vercel → Project → Settings → Environment
   Variables, or `.env.local` for local prod runs):

   | Variable | Value | Scope |
   |---|---|---|
   | `NEXT_PUBLIC_POSTHOG_KEY` | `phc_…` project token | all |
   | `NEXT_PUBLIC_POSTHOG_HOST` | `https://us.i.posthog.com` | all |
   | `NEXT_PUBLIC_GTM_ID` | `GTM-XXXXXXX` | all |
   | `NEXT_PUBLIC_GTM_AUTH` / `NEXT_PUBLIC_GTM_PREVIEW` | per-environment pair | preview/dev only |

4. Run the post-deploy verification (section 4) against the live URL.
5. Rollback: Vercel → Deployments → previous good deployment → **Promote to
   Production** (instant, no rebuild). Site rollback does not roll back the
   GTM container — evaluate section 2's rollback separately.

## 2. Publish a GTM container version (and roll it back)

The container uses three GTM **environments** (Admin → Environments):
**Dev**, **Staging**, and **Live** — the same promote model as Adobe Launch's
dev/stage/prod libraries. Each environment has its own `gtm_auth`/
`gtm_preview` pair; the site selects one via `NEXT_PUBLIC_GTM_AUTH` /
`NEXT_PUBLIC_GTM_PREVIEW` (Live needs neither).

Promotion flow:

1. Make tag/trigger/variable changes in a GTM **workspace**.
2. **Preview** the workspace (Tag Assistant) against localhost — walk the
   validation checklist in section 5.
3. Submit → **Create version** (name it `vN — what changed`, link the PR or
   ticket in notes). Publish to **Dev**.
4. Point a preview deployment at Dev (env vars above); re-run the checklist.
5. Promote the same version to **Staging**; validate on the staging URL.
6. Promote to **Live**. No re-testing gap: the exact version object that
   passed Staging is what Live serves.
7. Record the version number in the release notes.

Rollback:

1. GTM → **Versions** → select the last known-good version.
2. ⋮ menu → **Publish** → target **Live** (or the affected environment).
3. Rollback is a re-publish of an old immutable version — takes effect on
   next page load, no code deploy involved.
4. Verify with section 4, then diff the bad version (Versions → compare) to
   find what broke before re-attempting.

## 3. When the Playwright suite fails

1. **Read the failing spec name first** — the suite is organized by
   guarantee: `event-payload` (schema validity), `exact-once` (duplicate
   event_ids), `no-flicker` / `segment-timing` (the race), `consent-gate`
   (vendor calls pre-consent), `delivery` (events surviving navigation),
   `debug-overlay`, `engagement-order`.
2. Reproduce locally: `npx playwright test <spec> --headed` (or download the
   `playwright-report` artifact from the failed CI run).
3. Payload/schema failures → did a schema change without `npm run codegen`?
   The drift gate step in CI will also be red; regenerate and commit.
4. Timing failures (`decided_before_paint` false, flicker) → check that the
   decision read stayed synchronous: no `await` before `getDecision()` in
   `useLayoutEffect`, segment stamp still written by `stampSegment` *before*
   the dataLayer push.
5. Delivery failures → check `/api/collect` still returns 204 and the
   `pagehide`/`visibilitychange` listeners in `lib/tracking/deliver.ts`
   are bound once.
6. Consent-gate failures → a new vendor tag is firing pre-consent; gate its
   GTM trigger on the consent state.
7. Only after a diagnosed root cause: re-run CI. Never re-run to "see if it
   passes this time" — the suite has no known flaky tests, so a failure is
   signal.

## 4. Post-deploy event verification

Run within 10 minutes of any production deploy or GTM publish:

- [ ] Open the site with `?debug=1` — the decision debugger overlay appears.
- [ ] Click a destination: overlay shows `destination_viewed` fired, segment
      stamped, and interaction count bumped.
- [ ] Return home: overlay timeline completes with `personalized render`,
      `before paint: true`, latency ~0ms; hero + card order personalized.
- [ ] PostHog → [Activity](https://us.posthog.com/project/512758/activity/explore)
      (live events): the session's `page_viewed`, `destination_viewed`,
      `cta_clicked`, `personalization_decided` arrive within ~1 min.
- [ ] Spot-check one event's properties in PostHog: `event_id` present,
      `consent_state` correct, payload fields flattened as expected.
- [ ] Run the duplicate-check query from
      [sql-analysis.md](sql-analysis.md#5-duplicate-event_id-check-exact-once-end-to-end)
      — still zero duplicates.

## 5. Production validation with browser tools

The Playwright harness covers lower environments automatically; this is the
manual browser-tools pass for production (matches the "QA in lower
environments and production validation using browser tools" workflow):

**DevTools Network tab**
- [ ] Filter `collect` — CTA click enqueues, then a `POST /api/collect`
      (beacon on navigation, keepalive fetch on dwell) returns 204. Inspect
      the request payload: array of full validated events.
- [ ] Filter `gtm.js` — loads only after consent granted; with an environment
      pair set, the URL carries `gtm_auth`/`gtm_preview` (confirms which GTM
      environment is serving).
- [ ] Filter `/ingest` — PostHog traffic flows through the first-party
      reverse proxy, not `*.posthog.com` directly.
- [ ] **Consent denied pass**: clear storage, decline the banner, browse —
      zero requests to googletagmanager.com or any PostHog host.

**GTM Preview (Tag Assistant)**
- [ ] Connect Tag Assistant to the production URL.
- [ ] Fire each event; confirm the expected tags fire once (exact-once) and
      consent-gated tags stay blocked until grant.
- [ ] Check dataLayer contents per event against the JSON Schemas.

**PostHog**
- [ ] Live events arriving (section 4).
- [ ] Person profile carries the current `segment` property.
- [ ] Feature flag `personalized-hero` evaluates to the expected variant for
      a stamped browser.

**Console + debugger overlay**
- [ ] No `[tracking]` schema-validation errors in the console.
- [ ] `?debug=1` overlay: strategy `local-first`, `decided_before_paint:
      true`, delivery flush entries present.

## 6. Add a new event, end to end

1. **Schema first**: add `lib/tracking/schemas/<event_name>.json` (draft-07,
   `additionalProperties: false`, the shared envelope fields required).
2. `npm run codegen` — regenerates `lib/tracking/types.ts`; commit both.
3. Register the schema in the validator map in `lib/tracking/trackEvent.ts`.
4. Fire it via `trackEvent<NewEvent>({...})` from a tracker component or
   handler. Nothing else: delivery, debug overlay, and dedupe come free.
5. If the event seeds personalization, extend `stampSegment`/engagement.
6. GTM: add a trigger on the event name + forwarding tag in a workspace;
   walk section 2 (Dev → Staging → Live).
7. Tests: extend the payload-shape snapshot and add a spec asserting the
   event fires with a valid payload (copy `event-payload.spec.ts` shape).
8. Verify the whole chain with section 4's checklist; add the event name to
   the queries in [sql-analysis.md](sql-analysis.md) where relevant.
