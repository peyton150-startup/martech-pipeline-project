"use client";

import { useLayoutEffect, useState, type ReactNode } from "react";
import posthog from "posthog-js";
import {
  getDecision,
  type PersonalizationDecision,
} from "@/lib/personalization/getDecision";
import { trackEvent } from "@/lib/tracking/trackEvent";
import type { PersonalizationDecidedEvent } from "@/lib/tracking/types";

/**
 * Scoped anti-flicker gate for personalisable content.
 *
 * Rules:
 * 1. **Never** hides the whole page — only this slot's content region.
 * 2. Reserves layout space with explicit dimensions → CLS ≈ 0.
 * 3. Runs `getDecision()` synchronously inside `useLayoutEffect`
 *    (before the browser paints) for a flicker-free swap.
 * 4. Falls back to `defaultContent` if no decision is available.
 * 5. Emits a `personalization_decided` event with timing data.
 */
export default function PersonalizedSlot({
  slotId,
  defaultContent,
  variants,
  className,
}: {
  /** Unique key for this slot (used in data-testid and event payload). */
  slotId: string;
  /** Content shown when no segment is available. */
  defaultContent: ReactNode;
  /**
   * Map of variant key → content node. The key comes from `getDecision().variant`.
   * If the variant key is missing, `defaultContent` is used.
   */
  variants: Record<string, ReactNode>;
  /** Optional CSS class name for the wrapper. */
  className?: string;
}) {
  const [resolved, setResolved] = useState<ReactNode>(defaultContent);

  useLayoutEffect(() => {
    const start = performance.now();
    const decision: PersonalizationDecision = getDecision();
    const latency = performance.now() - start;

    // Pick the variant (falls back to default).
    const content =
      decision.variant !== "default" && variants[decision.variant]
        ? variants[decision.variant]
        : defaultContent;

    setResolved(content);

    // Emit instrumentation event.
    trackEvent<PersonalizationDecidedEvent>({
      event: "personalization_decided",
      personalization: {
        segment: decision.segment,
        variant: decision.variant,
        strategy: decision.strategy,
        decided_before_paint: true, // useLayoutEffect runs before paint
        latency_ms: Math.round(latency * 100) / 100,
      },
    });
    posthog.capture("personalization_decided", {
      segment: decision.segment,
      variant: decision.variant,
      strategy: decision.strategy,
      decided_before_paint: true,
      latency_ms: Math.round(latency * 100) / 100,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div data-testid={`personalized-slot-${slotId}`} className={className}>
      {resolved}
    </div>
  );
}
