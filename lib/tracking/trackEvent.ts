"use client";

import { getValidator } from "./validators";
import { recordDebugEvent, recordSegmentStamp } from "@/lib/debug/debugBus";
import { recordInteraction } from "@/lib/personalization/engagement";
import { recordBehaviorSignal } from "@/lib/personalization/behavior";
import { enqueueDelivery } from "./deliver";
import type { TrackedEvent, EventInput, ConsentState } from "./types";

declare global {
  interface Window {
    dataLayer: Record<string, unknown>[];
  }
}

const SEGMENT_KEY = "mtp_segment"; // read synchronously by the personalization layer (day 4)
const CONSENT_KEY = "mtp_consent";

// ---- consent ----------------------------------------------------------------

export function getConsentState(): ConsentState {
  if (typeof window === "undefined") return "pending";
  const stored = window.localStorage.getItem(CONSENT_KEY);
  return stored === "granted" || stored === "denied" ? stored : "pending";
}

// Minimal gtag helper — pushes the consent-command tuple that GTM reads.
function gtagPush(...args: unknown[]) {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(args as unknown as Record<string, unknown>);
}

export function setConsentState(state: Exclude<ConsentState, "pending">) {
  window.localStorage.setItem(CONSENT_KEY, state);
  window.dataLayer = window.dataLayer || [];

  // 1. GTM Consent Mode v2 update — must come before the custom event
  //    so GTM applies the new consent state before processing queued tags.
  gtagPush("consent", "update", {
    analytics_storage: state === "granted" ? "granted" : "denied",
    ad_storage: state === "granted" ? "granted" : "denied",
  });

  // 2. Custom consent_updated event for data-layer consumers.
  window.dataLayer.push({ event: "consent_updated", consent_state: state });

  // 3. Notify the delivery layer so any queue held while consent was pending
  //    flushes immediately on grant (and is dropped on denial).
  window.dispatchEvent(new CustomEvent("mtp:consent", { detail: state }));
}

// ---- segment stamping (the seed of same/next-page personalization) ----------

function stampSegment(evt: TrackedEvent) {
  if (evt.event !== "destination_viewed") return;

  const segmentData = JSON.stringify({
    segment: `${evt.destination.category}_intent`,
    source_event_id: evt.event_id,
    updated_at: evt.timestamp,
  });

  // 1. Synchronous localStorage write — the local-first personalization
  //    strategy reads this on the next page with zero latency.
  window.localStorage.setItem(SEGMENT_KEY, segmentData);

  // 2. Mirror to a cookie so edge middleware can read the segment
  //    server-side (localStorage is client-only).
  document.cookie = `mtp_segment=${encodeURIComponent(segmentData)};path=/;max-age=2592000;SameSite=Lax`;

  recordSegmentStamp(`${evt.destination.category}_intent`);
}

export function getSegment(): string | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(SEGMENT_KEY);
  if (!raw) return null;
  try {
    return (JSON.parse(raw) as { segment: string }).segment;
  } catch {
    return null;
  }
}

// ---- the wrapper -------------------------------------------------------------

/**
 * Validate → stamp → push. Returns the full event (useful in tests),
 * or null if validation failed (event is NOT pushed).
 */
export function trackEvent<T extends TrackedEvent>(input: EventInput<T>): T | null {
  if (typeof window === "undefined") return null; // SSR guard

  const full = {
    ...input,
    event_id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    consent_state: getConsentState(),
  } as T;

  const eventName = full.event;
  const validate = getValidator(eventName);
  if (!validate) {
    console.error(`[tracking] no schema registered for event "${eventName}"`);
    return null;
  }
  if (!validate(full)) {
    // Strict schemas + hard failure in dev is the point: bad payloads never ship.
    console.error(
      `[tracking] payload failed schema validation for "${eventName}"`,
      validate.errors
    );
    return null;
  }

  // Debug bus must see the event before stampSegment so the timeline's
  // event-fired mark precedes the stamp mark.
  recordDebugEvent(full);
  stampSegment(full);
  recordInteraction(full);
  recordBehaviorSignal(full);

  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(full as unknown as Record<string, unknown>);

  // Queue for first-party delivery that survives navigation (sendBeacon /
  // keepalive fetch on pagehide). GTM consumes the dataLayer push above;
  // this path guarantees the event reaches /api/collect at least once.
  enqueueDelivery(full);
  return full;
}
