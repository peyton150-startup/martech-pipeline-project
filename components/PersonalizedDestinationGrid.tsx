"use client";

import { useLayoutEffect, useState } from "react";
import DestinationCard from "./DestinationCard";
import type { Destination } from "@/lib/destinations";
import { getDecision } from "@/lib/personalization/getDecision";
import {
  getInteractionCounts,
  rankByEngagement,
} from "@/lib/personalization/engagement";
import { trackEvent } from "@/lib/tracking/trackEvent";
import type { PersonalizationDecidedEvent } from "@/lib/tracking/types";

/**
 * Engagement-aware destination grid.
 *
 * Composes two signals: the intent segment (category ordering) and the
 * per-destination interaction counts (the most-interacted destination is
 * promoted to the first cell — top-left, where users look first).
 *
 * Same anti-flicker contract as PersonalizedSlot: the server renders the
 * default order, then `useLayoutEffect` re-ranks synchronously from
 * localStorage before the browser paints. The grid never changes size, so
 * CLS stays at 0.
 */
export default function PersonalizedDestinationGrid({
  destinations,
}: {
  destinations: Destination[];
}) {
  const [ordered, setOrdered] = useState(destinations);

  useLayoutEffect(() => {
    const start = performance.now();
    const decision = getDecision();
    const { ranked, topSlug } = rankByEngagement(
      destinations,
      decision.segment,
      getInteractionCounts()
    );
    const latency = performance.now() - start;

    setOrdered(ranked);

    trackEvent<PersonalizationDecidedEvent>({
      event: "personalization_decided",
      slot_id: "home-cards",
      personalization: {
        segment: decision.segment,
        // Encode the engagement pick so telemetry shows *why* the grid
        // ordered itself this way, not just which segment variant won.
        variant: topSlug ? `${decision.variant}+top-${topSlug}` : decision.variant,
        // The engagement counts are also a synchronous localStorage read.
        strategy: topSlug ? "local-first" : decision.strategy,
        decided_before_paint: true, // useLayoutEffect runs before paint
        latency_ms: Math.round(latency * 100) / 100,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section
      aria-label="Destinations"
      data-testid="destination-grid"
      className="grid grid-cols-1 gap-6 sm:grid-cols-2"
    >
      {ordered.map((d, i) => (
        <DestinationCard key={d.slug} destination={d} priority={i === 0} />
      ))}
    </section>
  );
}
