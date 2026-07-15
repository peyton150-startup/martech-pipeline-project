/**
 * Local-first personalization decision.
 *
 * Reads the segment stamp from localStorage synchronously and maps it to a
 * content variant via a small rules object. No network call, no async — this
 * is what makes next-page personalization race-free: the segment was written
 * to localStorage by trackEvent (stampSegment) on the *previous* page.
 */

export interface PersonalizationDecision {
  segment: string | null;
  variant: string;
  strategy: "local-first" | "bootstrapped" | "default";
}

/** Segment → content-variant key. Extend when adding new categories. */
const SEGMENT_RULES: Record<string, string> = {
  beach_intent: "beach",
  ski_intent: "ski",
  city_intent: "city",
};

const SEGMENT_KEY = "mtp_segment";

/**
 * Synchronous decision — safe to call inside useLayoutEffect.
 * Returns the variant key and the strategy that resolved it.
 */
export function getDecision(): PersonalizationDecision {
  if (typeof window === "undefined") {
    return { segment: null, variant: "default", strategy: "default" };
  }

  const raw = window.localStorage.getItem(SEGMENT_KEY);
  if (!raw) {
    return { segment: null, variant: "default", strategy: "default" };
  }

  try {
    const parsed = JSON.parse(raw) as { segment: string };
    const segment = parsed.segment;
    const variant = SEGMENT_RULES[segment] || "default";
    return { segment, variant, strategy: "local-first" };
  } catch {
    return { segment: null, variant: "default", strategy: "default" };
  }
}

/**
 * Reorder a list to surface items matching the user's intent category first.
 * Non-matching items keep their original relative order.
 */
export function reorderBySegment<T extends { category: string }>(
  items: T[],
  segment: string | null
): T[] {
  if (!segment) return items;
  const category = segment.replace("_intent", "");
  return [
    ...items.filter((i) => i.category === category),
    ...items.filter((i) => i.category !== category),
  ];
}
