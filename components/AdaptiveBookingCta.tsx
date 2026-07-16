"use client";

import { useLayoutEffect, useState } from "react";
import BookingCta from "./BookingCta";
import { getBehaviorSegment } from "@/lib/personalization/behavior";
import { trackEvent } from "@/lib/tracking/trackEvent";
import type { PersonalizationDecidedEvent } from "@/lib/tracking/types";

/**
 * Behavior-aware booking CTA (slot: `detail-cta`).
 *
 * Composes with the intent segment: a visitor flagged `browsing_hesitant`
 * (viewed several destinations this session without committing) gets a softer,
 * assistance-oriented CTA instead of the hard book button. Decides
 * synchronously before paint (same anti-flicker contract as PersonalizedSlot)
 * and emits its own slot-scoped `personalization_decided` — so the behavioral
 * decision is observable data too, not just a UI swap.
 */
export default function AdaptiveBookingCta({
  destinationSlug,
}: {
  destinationSlug: string;
}) {
  const [hesitant, setHesitant] = useState(false);

  useLayoutEffect(() => {
    const start = performance.now();
    const behavior = getBehaviorSegment();
    const latency = performance.now() - start;
    const isHesitant = behavior === "browsing_hesitant";
    setHesitant(isHesitant);

    trackEvent<PersonalizationDecidedEvent>({
      event: "personalization_decided",
      slot_id: "detail-cta",
      personalization: {
        segment: behavior, // the behavioral segment drives this slot
        variant: isHesitant ? "assist" : "book",
        strategy: "local-first",
        decided_before_paint: true,
        latency_ms: Math.round(latency * 100) / 100,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (hesitant) {
    return (
      <div data-testid="cta-slot-detail" className="flex flex-col items-start gap-2">
        <BookingCta
          ctaId="talk_to_planner"
          location="detail_page"
          destinationSlug={destinationSlug}
          text="Not sure? Talk to a trip planner"
        />
        <p className="text-sm text-stone-500">
          You&apos;ve been exploring a few places — a planner can help you narrow it down.
        </p>
      </div>
    );
  }

  return (
    <div data-testid="cta-slot-detail">
      <BookingCta
        ctaId="book_now_detail"
        location="detail_page"
        destinationSlug={destinationSlug}
      />
    </div>
  );
}
