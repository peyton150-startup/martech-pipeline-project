# Decision Debugger Overlay

A live observability panel for the personalization engine. Append `?debug=1`
to any URL and a dev panel appears in the bottom-right corner; it stays on
across navigation (the flag persists in `sessionStorage`) until you close it
or visit any page with `?debug=0`.

The point: the interesting engineering here — the segment stamp, the
decision-before-paint race, the strategy selection — is invisible by design.
The overlay makes it visible in real time, so you can literally watch the
race condition get won as you click around.

## What it shows

| Section | Contents |
|---|---|
| **Segment** | The current `mtp_segment` value (e.g. `beach_intent`) and the page you're on. Updates live as stamps happen. |
| **Last decision** | Which strategy resolved the most recent `personalization_decided` event (`local-first` / `bootstrapped` / `default`), the variant it picked, `decided_before_paint`, and the decision latency in ms. |
| **Timeline** | One "race" through the pipeline: `destination_viewed` fired at 0ms → segment stamped (usually +0–2ms) → the next personalized render, with total elapsed time and whether it beat the paint. A new destination view starts a fresh timeline. |
| **Engagement** | Per-destination interaction counts and which destination currently wins the grid's top-left cell. |
| **Events** | The most recent tracked events, newest first. Click any entry to expand its full validated payload. |

## How it works

```
trackEvent ──▶ recordDebugEvent ──┐
stampSegment ─▶ recordSegmentStamp ├──▶ debugBus ──▶ <DebugOverlay>
engagement ──▶ recordEngagementBump ┘   (ring buffer + timeline)
```

- `lib/debug/debugBus.ts` is a tiny observer bus. The tracking pipeline
  reports into it at the same moments it does its real work, so the overlay
  sees exactly what production telemetry sees — it is a read-only observer
  and never fires events or influences decisions itself.
- Entries live in module state (survives client-side navigation) and are
  mirrored to `sessionStorage` (survives hard reloads within the tab). The
  cross-page timeline depends on this: the seeding event happens on one page
  and the personalized render on the next.
- Timeline marks use epoch-ms timestamps rather than `performance.now()`,
  because the race being measured spans a navigation and `performance.now()`
  resets per page load.
- The overlay mounts in the root layout but renders nothing unless the
  debug flag is set, and the bus records regardless — a few in-memory writes
  per page — so enabling it never changes the behavior being observed.

## Demo script (30 seconds)

1. Open `/?debug=1` — segment `none`, default hero, default card order.
2. Click a beach destination — watch `destination_viewed` fire and
   `segment stamped → beach_intent` land ~0–2ms later in the timeline.
3. Click "All destinations" — the hero and card order are personalized on
   first paint; the timeline completes with `personalized render`,
   `before paint: true`, and the decision latency.
4. Click around some more — the engagement counts climb, and the
   most-interacted destination claims the top-left card slot.
