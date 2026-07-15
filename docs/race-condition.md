# Personalization Race Condition & Three-Strategy Solution

## The Problem

When personalizing web content based on user behavior — for example, showing beach destinations first to a user who just viewed a beach destination — there is a fundamental race between two events:

1. **The moment the segment/intent is known** (e.g., `beach_intent` is written to storage)
2. **The moment the personalized page renders** (the browser paints the frame)

If the page renders _before_ the segment is available, the user sees a **"flash" of default content** that is then swapped to personalized content. This is the **personalization flicker problem**.

### Why Flicker Is Harmful

| Impact | Description |
|---|---|
| **Layout shift (CLS penalty)** | Google's Core Web Vitals penalize Cumulative Layout Shift. Swapping hero content after paint causes measurable CLS. |
| **Broken trust** | Users perceive the swap as the page being "broken" or "changing its mind." It undermines confidence in the site. |
| **Perceived slowness** | Even if the page loads fast, a visible content swap makes the experience _feel_ slow and janky. |

> [!IMPORTANT]
> Personalization flicker is **worse than no personalization at all**. A stable default is always preferable to a visible swap.

---

## The Key Metric: `decided_before_paint`

Every `personalization_decided` event emits a boolean field called **`decided_before_paint`**.

```jsonc
{
  "event": "personalization_decided",
  "strategy": "local-first",
  "segment": "beach_intent",
  "decided_before_paint": true   // ← the critical field
}
```

When `decided_before_paint` is **`true`**, it means:

- The personalization decision was made **before the browser painted the frame**
- The user saw personalized content from the very first render
- There was **zero flicker**

This is the metric the Playwright QA harness validates. Every personalization path must achieve `decided_before_paint: true` under normal conditions.

---

## Strategy 1: Local-First Decisioning

**The common-case fast path.**

### How It Works

1. The `destination_viewed` event fires when a user views a destination detail page.
2. `stampSegment()` **synchronously** writes `{category}_intent` to `localStorage` (key: `mtp_segment`).
3. On the **next page load**, `getDecision()` reads `localStorage` synchronously — zero network latency.
4. The personalized content renders on the first paint.

```
Page A (destination detail)         Page B (homepage)
┌─────────────────────────┐         ┌─────────────────────────┐
│ destination_viewed      │         │ useLayoutEffect()       │
│   → stampSegment()      │         │   → getDecision()       │
│   → localStorage.set()  │ ─nav─▶ │   → localStorage.get() │
│                         │         │   → render personalized │
└─────────────────────────┘         └─────────────────────────┘
```

### Characteristics

| Property | Value |
|---|---|
| **Latency** | ~0 ms (synchronous read) |
| **Correctness** | High — the segment was stamped on the previous page before navigation |
| **`decided_before_paint`** | ✅ Always true (sync read in `useLayoutEffect`) |
| **SEO compatible** | No (client-side only) |

### Limitation

Only works for **next-page personalization**. The segment must already exist from a previous page visit. A brand-new visitor with no browsing history will not have a segment in `localStorage`.

---

## Strategy 2: Bootstrapped Flags (Enterprise)

**Server-side evaluation for SSR compatibility.**

### How It Works

1. `stampSegment()` mirrors the segment from `localStorage` to a **cookie** (same value, accessible server-side).
2. **Edge middleware** reads the segment cookie on every request.
3. The middleware evaluates the `personalized-hero` feature flag **server-side** against the segment.
4. The evaluated flag value is **injected into the response** (e.g., via a `<script>` tag or response header).
5. `posthog-js` initializes with the **bootstrapped flag values** instead of waiting for a `/decide` API call.

```
Browser Cookie                Edge Middleware              Client
┌──────────────┐    ┌─────────────────────────────┐    ┌──────────────────┐
│ mtp_segment= │───▶│ Read cookie                 │    │ posthog.init({   │
│ beach_intent │    │ Evaluate personalized-hero  │───▶│   bootstrap: {   │
└──────────────┘    │ Inject flag into response   │    │     featureFlags  │
                    └─────────────────────────────┘    │   }              │
                                                       │ })               │
                                                       └──────────────────┘
```

### Characteristics

| Property | Value |
|---|---|
| **Latency** | ~0 ms on the client (server-evaluated) |
| **Correctness** | High — server-side evaluation is authoritative |
| **`decided_before_paint`** | ✅ Always true (values available at init) |
| **SEO compatible** | ✅ Yes (middleware runs before render, compatible with SSR) |

### Limitation

Requires an **edge runtime** (e.g., Vercel Edge Middleware, Cloudflare Workers). Adds middleware complexity and requires cookie synchronization to work correctly.

---

## Strategy 3: Scoped Anti-Flicker Gate (Safety Net)

**A graceful fallback that prevents flicker even when data is late.**

### How It Works

1. The `<PersonalizedSlot>` component wraps **only the personalizable region** — never the whole page.
2. The slot reserves explicit layout space (fixed dimensions) to prevent CLS regardless of outcome.
3. Inside the slot, `useLayoutEffect` **synchronously** attempts to read the personalization decision.
4. If the decision is available (e.g., from local-first), it renders immediately.
5. If the decision is **not available within ~150 ms**, the slot falls back to default content.

```
┌─────────────────────────────────────────────┐
│ Page Layout                                 │
│                                             │
│  ┌───────────────────────────────────────┐  │
│  │ <PersonalizedSlot>                    │  │
│  │   dimensions: 400×300 (pre-reserved)  │  │
│  │                                       │  │
│  │   t=0ms:   useLayoutEffect → read()   │  │
│  │   t<1ms:   ✅ segment found → render  │  │
│  │     OR                                │  │
│  │   t=150ms: ⏱ timeout → default shown  │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  Rest of page renders normally              │
└─────────────────────────────────────────────┘
```

### Characteristics

| Property | Value |
|---|---|
| **Latency** | 0–150 ms |
| **Correctness** | Safe fallback — shows default content if decision is late |
| **`decided_before_paint`** | ✅ True when local-first succeeds; ⚠️ timeout means default shown (no flicker either way) |
| **SEO compatible** | No (client-side) |
| **CLS** | ~0 (space is pre-reserved with explicit dimensions) |

### Limitation

The 150 ms timeout means that if the decision source is slow (e.g., a network call), the user sees default content rather than personalized content. This is by design — **no personalization is better than flickering personalization**.

---

## Strategy Comparison

| Strategy | Latency | Correctness | SEO Compatible | `decided_before_paint` | Best For |
|---|---|---|---|---|---|
| **Local-first** | ~0 ms | High | No | ✅ | Same-session next-page |
| **Bootstrapped flags** | ~0 ms (client) | High | Yes | ✅ | Enterprise, SSR |
| **Anti-flicker gate** | 0–150 ms | Safe fallback | No | Usually ✅ | Safety net, new visitors |

---

## Why `decided_before_paint` Matters

Personalization flicker is not just a cosmetic issue — it actively damages user experience and site performance:

1. **Users perceive the swap as broken behavior.** When a hero image changes 200 ms after load, users interpret it as the page "changing its mind." This erodes trust, especially on high-intent pages like booking flows.

2. **Google penalizes layout shifts.** Cumulative Layout Shift (CLS) is a Core Web Vital. A hero swap after paint is one of the most impactful CLS events possible, directly affecting search ranking.

3. **No personalization is better than late personalization.** A user who sees a stable default hero has a normal experience. A user who sees the hero _change_ has a degraded experience — even if the final content is more relevant.

The local-first approach solves this by ensuring the data is already available **synchronously** in `localStorage` before the component ever mounts. There is no network call, no async wait, no promise to resolve. The decision is a synchronous read that completes before `useLayoutEffect` returns — which itself completes before the browser paints.

> [!TIP]
> When adding new personalization rules, always verify `decided_before_paint: true` in your Playwright tests. If a new rule cannot guarantee this, wrap it in a `<PersonalizedSlot>` with the anti-flicker gate.

---

## How They Work Together

The three strategies are not alternatives — they form a **layered system** where each layer handles a different scenario:

```
┌─────────────────────────────────────────────────────────┐
│                    Request arrives                       │
│                                                         │
│  Layer 1: Bootstrapped Flags (if edge runtime present)  │
│  ┌───────────────────────────────────────────────────┐  │
│  │ Edge middleware reads cookie → evaluates flag     │  │
│  │ → injects value into response                    │  │
│  │ Result: SSR-compatible, zero-latency decision    │  │
│  └───────────────────────────────────────────────────┘  │
│                         │                               │
│                         ▼                               │
│  Layer 2: Local-First Decisioning (client)              │
│  ┌───────────────────────────────────────────────────┐  │
│  │ useLayoutEffect → getDecision()                   │  │
│  │ → sync read from localStorage                    │  │
│  │ Result: instant decision for returning visitors  │  │
│  └───────────────────────────────────────────────────┘  │
│                         │                               │
│                         ▼                               │
│  Layer 3: Anti-Flicker Gate (safety net)                │
│  ┌───────────────────────────────────────────────────┐  │
│  │ <PersonalizedSlot> with reserved space            │  │
│  │ → 150ms timeout → default content                │  │
│  │ Result: graceful fallback, zero CLS              │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Layer Responsibilities

- **Local-first** handles the **common case**: a returning visitor who already has a segment from a previous page view. This is the majority of personalization scenarios in a single session.

- **Bootstrapped flags** add **SSR compatibility** for enterprise deployments. When an edge runtime is available, the decision is made server-side before the HTML is even sent to the client. This is the gold standard for performance and SEO.

- **Anti-flicker gate** catches **edge cases** with a graceful fallback. New visitors, cleared storage, race conditions with async flag evaluation — the gate ensures that no matter what, the user never sees a content swap. The worst case is seeing default content, which is perfectly acceptable.

> [!NOTE]
> The layers are additive, not exclusive. A single page load may use bootstrapped flags for the initial server render, local-first for client-side hydration, and the anti-flicker gate as a safety wrapper — all simultaneously.
