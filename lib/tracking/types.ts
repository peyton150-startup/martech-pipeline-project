// TypeScript mirrors of the JSON Schemas in ./schemas.
// The schemas are the source of truth; if you change one, change the other.
// (Day-2+ improvement: generate these with json-schema-to-typescript.)

export type ConsentState = "granted" | "denied" | "pending";
export type DestinationCategory = "beach" | "ski" | "city";

interface BaseEvent {
  event_id: string; // uuid v4, stamped by trackEvent
  timestamp: string; // ISO 8601, stamped by trackEvent
  consent_state: ConsentState; // stamped by trackEvent
}

export interface PageViewedEvent extends BaseEvent {
  event: "page_viewed";
  page: {
    path: string;
    title: string;
    page_type: "home" | "destination" | "other";
    referrer?: string;
  };
}

export interface DestinationViewedEvent extends BaseEvent {
  event: "destination_viewed";
  destination: {
    slug: string;
    category: DestinationCategory;
    region?: string;
    price_from?: number;
  };
}

export interface CtaClickedEvent extends BaseEvent {
  event: "cta_clicked";
  cta: {
    cta_id: string;
    cta_text: string;
    location: "hero" | "card" | "detail_page" | "footer";
    destination_slug?: string;
  };
}

export interface PersonalizationDecidedEvent extends BaseEvent {
  event: "personalization_decided";
  personalization: {
    segment: string | null;
    variant: string;
    strategy: "local-first" | "bootstrapped" | "default";
    decided_before_paint: boolean;
    latency_ms: number;
  };
}

export type TrackedEvent =
  | PageViewedEvent
  | DestinationViewedEvent
  | CtaClickedEvent
  | PersonalizationDecidedEvent;

// What callers pass in: everything except the stamped fields.
export type EventInput<T extends TrackedEvent> = Omit<
  T,
  "event_id" | "timestamp" | "consent_state"
>;
