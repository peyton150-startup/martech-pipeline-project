# GTM Container Setup

## Overview

The Martech Pipeline uses a Google Tag Manager (GTM) container as the **single routing layer** between the application's `dataLayer` and all downstream vendor tags. Every event pushed by `trackEvent.ts` lands in the `dataLayer`; GTM picks it up via Data Layer Variables and Custom Event Triggers, then fires the appropriate vendor tag — but **only** when the user's consent state permits it. This keeps `trackEvent.ts` completely vendor-neutral: it knows nothing about PostHog, GA4, or any other endpoint.

---

## Prerequisites

1. **Create a GTM container** at [tagmanager.google.com](https://tagmanager.google.com).
2. Choose **Web** as the target platform.
3. Copy the **Container ID** (format: `GTM-XXXXXXX`).
4. Add it to your local environment file:

```dotenv
# .env.local
NEXT_PUBLIC_GTM_ID=GTM-XXXXXXX
```

5. The `GtmScript` component (loaded in the root layout) reads this variable and injects the GTM snippet on every page.

> [!IMPORTANT]
> Never commit `.env.local` to version control. The GTM container ID is not secret, but environment files may contain other sensitive values.

---

## Consent Mode v2 (App-Side)

Consent gating is handled **before** GTM loads. The app pushes two `dataLayer` commands:

### 1. Default Command (runs immediately, before GTM snippet)

```js
window.dataLayer = window.dataLayer || [];
window.dataLayer.push({
  event: "consent",
  consent_command: "default",
  analytics_storage: "denied",
  ad_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
});
```

This tells GTM that **all consent categories start as denied**. Any tag with a consent requirement will be blocked until an update is received.

### 2. Update Command (fires when user interacts with the consent banner)

```js
window.dataLayer.push({
  event: "consent",
  consent_command: "update",
  analytics_storage: "granted",   // or "denied"
  ad_storage: "granted",          // or "denied"
  ad_user_data: "granted",        // or "denied"
  ad_personalization: "granted",  // or "denied"
});
```

GTM processes these commands automatically via its built-in Consent Mode v2 engine — no additional GTM-side configuration is needed beyond marking each tag's **Additional Consent Checks** (covered in the [Tags](#tags) section).

### Consent State Persistence

| Store             | Key             | Values                          |
| ----------------- | --------------- | ------------------------------- |
| `localStorage`    | `mtp_consent`   | `granted`, `denied`, `pending`  |
| Cookie (mirror)   | `mtp_consent`   | `granted`, `denied`             |

On subsequent page loads the app reads `mtp_consent` from `localStorage`. If it finds `granted` or `denied`, it pushes a `consent update` immediately so GTM starts in the correct state. If `pending`, the default (denied) remains until the banner is used.

---

## Data Layer Variables

Create each of the following **Data Layer Variables** inside the GTM container. The **DL Variable Path** column is the value you enter in the GTM "Data Layer Variable Name" field.

| GTM Variable Name               | Variable Type        | DL Variable Path            | Populated By Event(s)                              |
| -------------------------------- | -------------------- | --------------------------- | -------------------------------------------------- |
| `dlv.event`                      | Built-in (Event)     | _(built-in)_                | All events                                         |
| `dlv.page.path`                  | Data Layer Variable  | `page.path`                 | `page_viewed`                                      |
| `dlv.page.title`                 | Data Layer Variable  | `page.title`                | `page_viewed`                                      |
| `dlv.page.page_type`             | Data Layer Variable  | `page.page_type`            | `page_viewed`                                      |
| `dlv.destination.slug`           | Data Layer Variable  | `destination.slug`          | `destination_viewed`                               |
| `dlv.destination.category`       | Data Layer Variable  | `destination.category`      | `destination_viewed`                               |
| `dlv.destination.region`         | Data Layer Variable  | `destination.region`        | `destination_viewed`                               |
| `dlv.destination.price_from`     | Data Layer Variable  | `destination.price_from`    | `destination_viewed`                               |
| `dlv.cta.cta_id`                 | Data Layer Variable  | `cta.cta_id`                | `cta_clicked`                                      |
| `dlv.cta.cta_text`               | Data Layer Variable  | `cta.cta_text`              | `cta_clicked`                                      |
| `dlv.cta.location`               | Data Layer Variable  | `cta.location`              | `cta_clicked`                                      |
| `dlv.cta.destination_slug`       | Data Layer Variable  | `cta.destination_slug`      | `cta_clicked`                                      |
| `dlv.consent_state`              | Data Layer Variable  | `consent_state`             | All events                                         |
| `dlv.event_id`                   | Data Layer Variable  | `event_id`                  | All events                                         |
| `dlv.timestamp`                  | Data Layer Variable  | `timestamp`                 | All events                                         |
| `dlv.personalization.segment`    | Data Layer Variable  | `personalization.segment`   | `personalization_decided`                           |
| `dlv.personalization.variant`    | Data Layer Variable  | `personalization.variant`   | `personalization_decided`                           |
| `dlv.personalization.strategy`   | Data Layer Variable  | `personalization.strategy`  | `personalization_decided`                           |

> [!TIP]
> Use a consistent naming prefix (`dlv.`) so all Data Layer Variables sort together in the GTM variable picker.

---

## Custom Event Triggers

Create the following **Custom Event** triggers. Each listens for a specific `event` value pushed to the `dataLayer`.

| Trigger Name                    | Trigger Type   | Event Name                  | Notes                                          |
| ------------------------------- | -------------- | --------------------------- | ---------------------------------------------- |
| `CE - page_viewed`              | Custom Event   | `page_viewed`               | Fires on every route change                    |
| `CE - destination_viewed`       | Custom Event   | `destination_viewed`        | Fires on `/destinations/[slug]` pages          |
| `CE - cta_clicked`              | Custom Event   | `cta_clicked`               | Fires on hero CTA and card CTA clicks          |
| `CE - personalization_decided`  | Custom Event   | `personalization_decided`   | Fires when the personalization engine resolves  |
| `CE - consent_updated`          | Custom Event   | `consent_updated`           | Fires after the user interacts with the banner  |

All event names are **exact match** — do not check "Use regex matching."

---

## Tags

### PostHog — All Events (Custom HTML)

This tag captures every application event and forwards it to PostHog via the GTM container.

| Setting                    | Value                                                                                   |
| -------------------------- | --------------------------------------------------------------------------------------- |
| **Tag Type**               | Custom HTML                                                                             |
| **Firing Triggers**        | `CE - page_viewed`, `CE - destination_viewed`, `CE - cta_clicked`, `CE - personalization_decided` |
| **Additional Consent**     | Require `analytics_storage = granted`                                                   |
| **Tag Firing Priority**    | 0 (default)                                                                             |

#### Option A — GTM-Managed Capture (recommended)

Use this when PostHog is loaded via the `PostHogProvider` in the Next.js app but you want **GTM to control when events are actually captured**, keeping `trackEvent.ts` vendor-neutral.

```html
<script>
  // PostHog is already initialised by PostHogProvider.
  // GTM fires this tag only when consent is granted.
  (function () {
    if (typeof posthog === "undefined") return;

    var event = {{dlv.event}};
    var props = {
      // Common
      event_id:        {{dlv.event_id}},
      timestamp:       {{dlv.timestamp}},
      consent_state:   {{dlv.consent_state}},

      // Page
      page_path:       {{dlv.page.path}},
      page_title:      {{dlv.page.title}},
      page_type:       {{dlv.page.page_type}},

      // Destination
      destination_slug:     {{dlv.destination.slug}},
      destination_category: {{dlv.destination.category}},
      destination_region:   {{dlv.destination.region}},
      destination_price:    {{dlv.destination.price_from}},

      // CTA
      cta_id:               {{dlv.cta.cta_id}},
      cta_text:             {{dlv.cta.cta_text}},
      cta_location:         {{dlv.cta.location}},
      cta_destination_slug: {{dlv.cta.destination_slug}},

      // Personalization
      personalization_segment:  {{dlv.personalization.segment}},
      personalization_variant:  {{dlv.personalization.variant}},
      personalization_strategy: {{dlv.personalization.strategy}}
    };

    // Strip undefined values so PostHog doesn't store empty keys
    var clean = {};
    for (var key in props) {
      if (props[key] !== undefined && props[key] !== null) {
        clean[key] = props[key];
      }
    }

    posthog.capture(event, clean);
  })();
</script>
```

#### Option B — Lightweight Forwarding (alternative)

If PostHog is **only** loaded through the `PostHogProvider` and it already auto-captures `$pageview`, you may prefer a simpler tag that only forwards **custom** events:

```html
<script>
  (function () {
    if (typeof posthog === "undefined") return;

    var event = {{dlv.event}};
    // Skip page_viewed since PostHog auto-captures $pageview
    if (event === "page_viewed") return;

    posthog.capture(event, {
      event_id: {{dlv.event_id}},
      timestamp: {{dlv.timestamp}}
      // Add only the DLVs relevant to this event category
    });
  })();
</script>
```

> [!NOTE]
> **Option A** is recommended for the Martech Pipeline because it gives GTM full control over the event payload, making it easier to add or remove properties without redeploying the app.

---

## Verification

Use **GTM Preview Mode** to confirm the consent → trigger → tag chain works correctly.

### Steps

1. In GTM, click **Preview** and enter your local dev URL (`http://localhost:3000`).
2. The Tag Assistant panel will open alongside your site.

### Test Matrix

| Scenario | Consent State | Expected Tags Fired | What to Check |
| --- | --- | --- | --- |
| Fresh visit (no consent) | `pending` → default `denied` | **None** | Tag Assistant shows triggers firing but tags blocked by consent |
| User denies consent | `denied` | **None** | Confirm "PostHog — All Events" tag is listed under "Tags Not Fired" with reason "Consent" |
| User grants consent | `granted` | **PostHog — All Events** | Click through pages; every `page_viewed`, `destination_viewed`, etc. should fire the tag |
| Navigate to a destination | `granted` | **PostHog — All Events** | Inspect the tag's "Values" tab — `dlv.destination.slug` should match the URL slug |
| Click a CTA | `granted` | **PostHog — All Events** | Verify `dlv.cta.cta_id`, `dlv.cta.cta_text`, `dlv.cta.location` are populated |
| Revoke consent mid-session | `denied` | **None** (from this point on) | Subsequent events should **not** fire the PostHog tag |

### Debugging Tips

- **Variables tab**: After each event, click the event in the left rail and check the "Variables" tab. Every `dlv.*` variable should show its resolved value.
- **Console check**: Open DevTools → Console and run `window.dataLayer` to inspect the raw pushes.
- **PostHog verification**: After granting consent, open the PostHog **Live Events** view to confirm events arrive with the expected properties.

---

## GTM ↔ Adobe Launch Mapping Table

For teams familiar with Adobe Experience Platform Launch (now called "Tags" in Adobe Experience Platform Data Collection), this table maps GTM concepts to their Adobe equivalents.

| GTM Concept | Adobe Launch Analog | Purpose | Example |
| --- | --- | --- | --- |
| Data Layer Variable | Data Element | Extract a value from the page data layer | `page.path` → route path |
| Custom Event Trigger | Rule (Event + Conditions) | Define when a tag/action should fire | Fire on `destination_viewed` event |
| Tag (Custom HTML) | Extension Action (e.g., Adobe Analytics Send Beacon) | Execute vendor code when trigger fires | Send event to PostHog |
| Consent Mode v2 | Adobe Privacy Extension / Opt-in Service | Gate tag execution on user consent | Block analytics until consent granted |
| Container | Property | Top-level organizational unit | One per site/environment |
| Workspace | Development Library | Isolated editing environment | Draft changes before publish |

> [!TIP]
> If migrating from Adobe Launch, the biggest conceptual difference is that GTM's Consent Mode v2 is built into the platform — you don't need a separate extension. Adobe Launch requires the Privacy Extension or Experience Platform Consent connector for equivalent gating.

---

## Architecture Decision

```
┌──────────────┐     dataLayer.push()     ┌─────────────┐    consent gate    ┌─────────────┐
│ trackEvent() │ ───────────────────────►  │     GTM     │ ─────────────────► │   PostHog   │
│  (app code)  │                           │  Container  │                    │   (cloud)   │
└──────────────┘                           └─────────────┘                    └─────────────┘
       │                                          │
       │  vendor-neutral                          │  vendor-specific
       │  (JSON schema validated)                 │  (Custom HTML tag)
```

**Why route through GTM instead of calling `posthog.capture()` directly inside `trackEvent.ts`?**

1. **Vendor neutrality** — `trackEvent.ts` only knows about the `dataLayer` and JSON schemas. It has zero vendor imports. Swapping PostHog for Amplitude (or adding GA4) means adding/editing a GTM tag, not changing application code.

2. **Consent gating in one place** — GTM's built-in Consent Mode blocks or allows tags based on the user's consent state. The app doesn't need `if (consent === 'granted')` guards scattered through tracking calls.

3. **Non-engineer control** — Marketing or analytics teams can modify tag payloads, add triggers, or integrate new vendors directly in GTM without a code deploy.

**What `PostHogProvider` still handles:**

| Responsibility | Handled By | Why |
| --- | --- | --- |
| SDK initialization | `PostHogProvider` | PostHog must be on the page for `posthog.capture()` calls in GTM tags to work |
| User identity (`posthog.identify()`) | `PostHogProvider` | Identity is set once and persists across events |
| Segment super-properties | `PostHogProvider` | `posthog.register({ segment })` attaches the segment to every event automatically |
| Feature flag evaluation | `PostHogProvider` | `posthog.getFeatureFlag('personalized-hero')` is called by the personalization engine |
| Event capture | **GTM tag** | All `posthog.capture()` calls live in the GTM Custom HTML tag, not in app code |

> [!IMPORTANT]
> Do **not** add `posthog.capture()` calls inside `trackEvent.ts` or any React component. All event dispatch flows through the `dataLayer` → GTM → vendor tag pipeline.
