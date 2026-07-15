/* eslint-disable */
/**
 * AUTO-GENERATED FILE — DO NOT EDIT BY HAND.
 *
 * Generated from lib/tracking/schemas/*.json by `npm run codegen`
 * (scripts/generate-types.mjs). The JSON Schemas are the single source of
 * truth for event shape; ajv validates against them at runtime and this file
 * mirrors them for compile time. CI fails if this file drifts from the
 * schemas, so regenerate after any schema change.
 */

export type ConsentState = "granted" | "denied" | "pending";
export type DestinationCategory = "beach" | "ski" | "city";

/**
 * Fired when a user clicks a booking or conversion CTA.
 */
export interface CtaClickedEvent {
  event: "cta_clicked";
  event_id: string;
  timestamp: string;
  cta: {
    cta_id: string;
    cta_text: string;
    location: "hero" | "card" | "detail_page" | "footer";
    destination_slug?: string;
  };
  consent_state: "granted" | "denied" | "pending";
}
/**
 * Fired when a destination detail page renders. The category drives audience segmentation.
 */
export interface DestinationViewedEvent {
  event: "destination_viewed";
  event_id: string;
  timestamp: string;
  destination: {
    slug: string;
    category: "beach" | "ski" | "city";
    region?: string;
    price_from?: number;
  };
  consent_state: "granted" | "denied" | "pending";
}
/**
 * Fired once per page render, as early as possible in the page lifecycle.
 */
export interface PageViewedEvent {
  event: "page_viewed";
  event_id: string;
  timestamp: string;
  page: {
    path: string;
    title: string;
    page_type: "home" | "destination" | "other";
    referrer?: string;
  };
  consent_state: "granted" | "denied" | "pending";
}
/**
 * Fired when the personalization engine resolves a decision for a slot. Records which strategy won and whether the decision was ready before the first paint.
 */
export interface PersonalizationDecidedEvent {
  event: "personalization_decided";
  event_id: string;
  timestamp: string;
  consent_state: "granted" | "denied" | "pending";
  personalization: {
    segment: string | null;
    variant: string;
    strategy: "local-first" | "bootstrapped" | "default";
    decided_before_paint: boolean;
    latency_ms: number;
  };
}
export type TrackedEvent =
  | CtaClickedEvent
  | DestinationViewedEvent
  | PageViewedEvent
  | PersonalizationDecidedEvent;

/** What callers pass to trackEvent: everything except the stamped fields. */
export type EventInput<T extends TrackedEvent> = Omit<
  T,
  "event_id" | "timestamp" | "consent_state"
>;
