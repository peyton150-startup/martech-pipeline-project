"use client";

/**
 * Debug bus for the decision-debugger overlay (`?debug=1`).
 *
 * The tracking pipeline reports into this bus (trackEvent → recordDebugEvent,
 * stampSegment → recordSegmentStamp, engagement → recordEngagementBump) and
 * the overlay subscribes via useSyncExternalStore. Recording is a few cheap
 * writes per page, so the bus always records; only the overlay UI is gated
 * behind debug mode.
 *
 * Persistence model:
 * - Module state survives client-side (App Router) navigations.
 * - sessionStorage mirrors survive hard reloads within the tab — the
 *   cross-page timeline (event fired → segment stamped → next personalized
 *   render) depends on this, since the interesting story spans a navigation.
 */

import type { TrackedEvent } from "@/lib/tracking/types";

export type DebugEntryKind = "event" | "stamp" | "engagement" | "delivery";

export interface DebugEntry {
  id: string;
  /** Epoch ms — comparable across pages, unlike performance.now(). */
  at: number;
  kind: DebugEntryKind;
  label: string;
  /** Pathname where the entry was recorded. */
  path: string;
  /** Full event payload, shown in the overlay's inspector. */
  payload?: unknown;
}

/**
 * One "race" through the pipeline: the destination_viewed that seeds the
 * segment, the synchronous stamp, and the first personalized render that
 * consumes it (usually on the next page). A new destination_viewed starts a
 * fresh timeline.
 */
export interface DecisionTimeline {
  segment: string;
  sourceEvent: string;
  eventFiredAt: number;
  segmentStampedAt?: number;
  decidedAt?: number;
  decidedPath?: string;
  strategy?: string;
  decidedBeforePaint?: boolean;
  latencyMs?: number;
}

export interface DebugState {
  entries: DebugEntry[];
  timeline: DecisionTimeline | null;
}

const ENTRIES_KEY = "mtp_debug_entries";
const TIMELINE_KEY = "mtp_debug_timeline";
const MAX_ENTRIES = 30;

const EMPTY_STATE: DebugState = { entries: [], timeline: null };

let state: DebugState = EMPTY_STATE;
let hydrated = false;
const listeners = new Set<() => void>();

/**
 * The bus only records when debug mode is active, so normal traffic pays
 * nothing (no per-event sessionStorage writes, no payloads persisted for
 * visitors who will never open the overlay). Active means the `?debug=1`
 * query param on the current URL, or the sessionStorage flag the overlay
 * sets — checking both means recording is live even on the very first paint
 * of a `?debug=1` load, before the overlay's effect has run.
 */
function isDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.sessionStorage.getItem("mtp_debug") === "1") return true;
  } catch {
    // sessionStorage blocked — fall through to the URL check.
  }
  return /(?:^|[?&])debug=1(?:&|$)/.test(window.location.search);
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const entriesRaw = window.sessionStorage.getItem(ENTRIES_KEY);
    const timelineRaw = window.sessionStorage.getItem(TIMELINE_KEY);
    state = {
      entries: entriesRaw ? (JSON.parse(entriesRaw) as DebugEntry[]) : [],
      timeline: timelineRaw
        ? (JSON.parse(timelineRaw) as DecisionTimeline)
        : null,
    };
  } catch {
    state = { entries: [], timeline: null };
  }
}

function persist() {
  try {
    window.sessionStorage.setItem(ENTRIES_KEY, JSON.stringify(state.entries));
    if (state.timeline) {
      window.sessionStorage.setItem(TIMELINE_KEY, JSON.stringify(state.timeline));
    } else {
      window.sessionStorage.removeItem(TIMELINE_KEY);
    }
  } catch {
    // Storage full or unavailable — the overlay just loses reload persistence.
  }
}

function setState(next: DebugState) {
  state = next;
  persist();
  listeners.forEach((fn) => fn());
}

function pushEntry(kind: DebugEntryKind, label: string, payload?: unknown) {
  const entry: DebugEntry = {
    id: crypto.randomUUID(),
    at: Date.now(),
    kind,
    label,
    path: window.location.pathname,
    payload,
  };
  setState({
    ...state,
    entries: [...state.entries, entry].slice(-MAX_ENTRIES),
  });
  return entry;
}

// ---- reporting API (called by the tracking pipeline) ------------------------

/** Called by trackEvent for every validated event, before stampSegment. */
export function recordDebugEvent(evt: TrackedEvent): void {
  if (typeof window === "undefined" || !isDebugEnabled()) return;
  hydrate();
  pushEntry("event", evt.event, evt);

  if (evt.event === "destination_viewed") {
    // This event seeds the segment — start a fresh timeline race.
    setState({
      ...state,
      timeline: {
        segment: `${evt.destination.category}_intent`,
        sourceEvent: `destination_viewed (${evt.destination.slug})`,
        eventFiredAt: Date.now(),
      },
    });
  } else if (evt.event === "personalization_decided") {
    const t = state.timeline;
    // First personalized render after the stamp completes the race.
    if (t && t.decidedAt === undefined) {
      setState({
        ...state,
        timeline: {
          ...t,
          decidedAt: Date.now(),
          decidedPath: window.location.pathname,
          strategy: evt.personalization.strategy,
          decidedBeforePaint: evt.personalization.decided_before_paint,
          latencyMs: evt.personalization.latency_ms,
        },
      });
    }
  }
}

/** Called by stampSegment immediately after the localStorage/cookie write. */
export function recordSegmentStamp(segment: string): void {
  if (typeof window === "undefined" || !isDebugEnabled()) return;
  hydrate();
  pushEntry("stamp", `segment stamped → ${segment}`);
  const t = state.timeline;
  if (t && t.segmentStampedAt === undefined) {
    setState({
      ...state,
      timeline: { ...t, segmentStampedAt: Date.now() },
    });
  }
}

/** Called when an interaction count changes (engagement ranking input). */
export function recordEngagementBump(slug: string, count: number): void {
  if (typeof window === "undefined" || !isDebugEnabled()) return;
  hydrate();
  pushEntry("engagement", `interaction → ${slug} (×${count})`);
}

/** Called when the delivery layer flushes a batch to /api/collect. */
export function recordDeliveryFlush(
  count: number,
  transport: string,
  reason: string
): void {
  if (typeof window === "undefined" || !isDebugEnabled()) return;
  hydrate();
  pushEntry(
    "delivery",
    `flushed ${count} event${count === 1 ? "" : "s"} via ${transport} (${reason})`
  );
}

// ---- subscription API (used by the overlay via useSyncExternalStore) --------

export function subscribeDebug(listener: () => void): () => void {
  hydrate();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getDebugState(): DebugState {
  hydrate();
  return state;
}

export function getServerDebugState(): DebugState {
  return EMPTY_STATE;
}

/** Reset log + timeline (the overlay's "clear" button). */
export function clearDebugState(): void {
  if (typeof window === "undefined") return;
  hydrated = true;
  setState({ entries: [], timeline: null });
}
