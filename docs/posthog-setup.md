# PostHog Setup

## Overview

PostHog provides **product analytics**, **user segmentation**, and **feature flags** for the Martech Pipeline project. Rather than calling `posthog.capture()` directly from application code, all events reach PostHog through **Google Tag Manager** (GTM). This vendor-neutral approach keeps the tracking layer decoupled from any single analytics provider.

The `PostHogProvider` component is responsible for:

- Initializing the `posthog-js` SDK (only after consent is granted)
- Setting segment-based person properties for cohort building
- Bootstrapping feature-flag values so the UI renders without flicker

---

## Prerequisites

1. **Create a PostHog project** at [app.posthog.com](https://app.posthog.com) (or your self-hosted instance).
2. **Copy the project API key** (starts with `phc_`) and the **host URL** from *Project Settings → API Keys*.
3. **Add both values to `.env.local`** in the project root:

```env
NEXT_PUBLIC_POSTHOG_KEY=phc_...
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

> [!IMPORTANT]
> The `NEXT_PUBLIC_` prefix is required so Next.js exposes these variables to the browser bundle. Never store secret keys here — the project API key is a **write-only** key safe for client-side use.

---

## Consent-Gated Initialization

The `PostHogProvider` component **only** initializes `posthog-js` when consent has been explicitly granted. No tracking calls, cookies, or network requests are made until the user opts in.

### Initialization Flow

| Consent State | Behavior |
|---|---|
| `granted` | SDK initializes immediately on mount |
| `pending` | SDK waits; a listener watches for consent changes and initializes lazily once granted |
| `denied` | SDK is never initialized; listener remains active in case the user changes their preference |

### How It Works

1. On mount, the provider calls `getConsentState()` (reads from `localStorage` key `mtp_consent`).
2. If the state is `'granted'`, `posthog.init()` is called right away.
3. If the state is `'pending'` or `'denied'`, the provider registers a listener for consent-state changes (via a `storage` event or an in-app consent callback).
4. When consent transitions to `'granted'`, the SDK initializes lazily — picking up any segment data and bootstrapped flags that are already available.

This ensures **zero tracking occurs without explicit user consent**.

---

## Segment Person Properties

On each page load, the provider reads the current user segment and pushes it to PostHog as a **person property**. This enables powerful cohort building inside the PostHog UI.

### Mechanism

1. `getSegment()` reads from `localStorage` key `mtp_segment`.
2. The returned value is one of: `beach_intent`, `ski_intent`, `city_intent`, or `null`.
3. If a segment exists, the provider calls:

```ts
posthog.setPersonProperties({ segment: 'beach_intent' });
```

4. PostHog attaches this property to the user's person profile.

### Using Segments in PostHog

Once person properties are flowing, you can:

- **Build cohorts** — e.g., *"All users where `segment` = `beach_intent`"*
- **Filter dashboards** — slice any insight by the `segment` property
- **Target feature flags** — roll out flags to specific segment cohorts (see below)

---

## Feature Flag: `personalized-hero`

The `personalized-hero` flag controls which hero content variant is displayed on the home page.

### PostHog Configuration

1. Navigate to **Feature Flags → New Feature Flag** in your PostHog project.
2. Set the **key** to `personalized-hero`.
3. Set the **flag type** to **Multivariate** with the following variants:

| Variant | Description |
|---|---|
| `beach` | Beach-themed hero (tropical imagery, warm palette) |
| `ski` | Ski-themed hero (mountain imagery, cool palette) |
| `city` | City-themed hero (urban imagery, neutral palette) |
| `default` | Generic hero (no personalization) |

4. Configure **rollout by cohort**:

| Cohort (Person Property) | Variant Served |
|---|---|
| `segment` = `beach_intent` | `beach` |
| `segment` = `ski_intent` | `ski` |
| `segment` = `city_intent` | `city` |
| Everyone else | `default` |

### How the App Consumes the Flag

The flag's variant value maps directly to hero content in the home page component. The component reads the flag value and renders the corresponding hero imagery, copy, and call-to-action.

### Demo Mode: Static Rules Map

For the demo environment, the app includes a **static rules map** that evaluates the flag locally without requiring a round-trip to the PostHog `/decide` endpoint:

```ts
// Simplified static evaluation for demo purposes
const STATIC_FLAG_RULES: Record<string, string> = {
  beach_intent: 'beach',
  ski_intent:   'ski',
  city_intent:  'city',
};

function evaluateFlag(segment: string | null): string {
  return segment ? STATIC_FLAG_RULES[segment] ?? 'default' : 'default';
}
```

This avoids external dependencies during local development and demos while maintaining the same contract that the real PostHog flag would provide.

---

## Bootstrapped Flags

To eliminate any **flicker** or **layout shift** caused by waiting for the PostHog `/decide` endpoint, the `PostHogProvider` accepts **bootstrapped flag values** at initialization time.

### How Bootstrapping Works

1. **Edge middleware** reads the user's segment from the `mtp_segment` cookie (mirrored from `localStorage`).
2. The middleware maps the segment to the expected flag variant using the same static rules.
3. The resolved flag values are injected into the page props / provider context.
4. `posthog.init()` receives the bootstrapped values via the `bootstrap` option:

```ts
posthog.init(key, {
  api_host: host,
  bootstrap: {
    featureFlags: { 'personalized-hero': 'beach' }
  }
});
```

### Benefits

| Concern | Without Bootstrap | With Bootstrap |
|---|---|---|
| Flag availability | After `/decide` response (~100-300 ms) | Immediate at SDK init |
| Hero flicker | Visible flash as flag loads | No flicker — correct variant from first paint |
| Network dependency | Requires PostHog to be reachable | Works offline / in demo mode |

> [!TIP]
> Bootstrapped values are treated as the **initial** state. Once the SDK connects and fetches fresh values from `/decide`, it will update flags silently. If the bootstrapped value matches the server value (which it should for deterministic segment-based flags), no re-render occurs.

---

## Architecture Decision: Events Through GTM

All analytics events flow through GTM rather than calling `posthog.capture()` directly. This is a deliberate architectural choice.

### Why GTM as the Event Bus

| Benefit | Detail |
|---|---|
| **Vendor neutrality** | `trackEvent()` in `lib/tracking/trackEvent.ts` pushes to `window.dataLayer` — it has no knowledge of PostHog, GA4, or any other vendor |
| **Add/remove vendors without code changes** | New analytics tools are wired up entirely within the GTM container; no PR required |
| **Centralized consent gating** | GTM's consent mode controls which tags fire; the app doesn't need per-vendor consent checks |
| **Schema validation at the source** | `trackEvent()` validates events against JSON schemas before they hit `dataLayer`, ensuring all downstream vendors receive clean data |

### Trade-offs

| Trade-off | Mitigation |
|---|---|
| Slightly more complex GTM setup | Tag and trigger templates are documented and version-controlled |
| Extra abstraction layer | Justified by the flexibility and separation of concerns it provides |
| PostHog tag must be configured in GTM | One-time setup; tag template is reusable |

---

## Event Flow Diagram

The complete path from user action to PostHog ingestion:

```
User Action
     │
     ▼
trackEvent()                    ← validates against JSON schema
     │
     ▼
window.dataLayer.push()         ← vendor-neutral data layer
     │
     ▼
GTM Container                   ← consent mode checks
     │
     ▼
PostHog Tag (consent-gated)     ← fires only when consent = granted
     │
     ▼
posthog.capture()               ← event sent to PostHog ingestion API
```

### Key Events

| Event Name | When Fired | Key Properties |
|---|---|---|
| `page_viewed` | Every route change | `page_path`, `page_title` |
| `destination_viewed` | User views a destination detail page | `destination_id`, `destination_name`, `category` |
| `cta_clicked` | User clicks a call-to-action | `cta_id`, `cta_text`, `cta_location` |
| `personalization_decided` | Personalization variant is resolved | `flag_key`, `variant`, `strategy` |

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| No events appearing in PostHog | Consent not granted, or GTM tag misconfigured | Check `localStorage` for `mtp_consent = 'granted'`; verify GTM tag is firing in GTM Preview mode |
| Feature flag returns `undefined` | SDK not initialized or API key incorrect | Confirm `NEXT_PUBLIC_POSTHOG_KEY` is set; check browser console for init errors |
| Hero flickers on load | Bootstrapped flags not provided | Ensure edge middleware is running and the `mtp_segment` cookie is set |
| Person properties not appearing | `setPersonProperties` called before init | The provider should gate property calls behind SDK readiness; check initialization order |
