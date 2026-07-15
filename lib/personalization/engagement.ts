"use client";

/**
 * Engagement counts — the second personalization signal.
 *
 * Every event that references a destination (destination_viewed, cta_clicked
 * with a destination_slug) increments a per-slug counter in localStorage.
 * The home grid promotes the most-interacted destination to the first cell
 * (top-left — the first place users look), then falls back to segment
 * ordering for the rest.
 *
 * Same local-first contract as the segment stamp: synchronous writes on the
 * previous page, synchronous reads before paint on the next.
 */

import { recordEngagementBump } from "@/lib/debug/debugBus";
import { reorderBySegment } from "./getDecision";
import type { TrackedEvent } from "@/lib/tracking/types";

const INTERACTIONS_KEY = "mtp_interactions";

export function getInteractionCounts(): Record<string, number> {
  if (typeof window === "undefined") return {};
  const raw = window.localStorage.getItem(INTERACTIONS_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, number>;
  } catch {
    return {};
  }
}

function bumpInteraction(slug: string): void {
  const counts = getInteractionCounts();
  counts[slug] = (counts[slug] ?? 0) + 1;
  window.localStorage.setItem(INTERACTIONS_KEY, JSON.stringify(counts));
  recordEngagementBump(slug, counts[slug]);
}

/**
 * Called by trackEvent for every validated event. Extracts the destination
 * reference (if any) and bumps its interaction count.
 */
export function recordInteraction(evt: TrackedEvent): void {
  if (typeof window === "undefined") return;
  if (evt.event === "destination_viewed") {
    bumpInteraction(evt.destination.slug);
  } else if (evt.event === "cta_clicked" && evt.cta.destination_slug) {
    bumpInteraction(evt.cta.destination_slug);
  }
}

/**
 * Order destinations for the grid: the most-interacted destination first,
 * remaining items segment-matched first, original relative order preserved.
 * Ties on interaction count resolve in favor of the segment ordering.
 */
export function rankByEngagement<T extends { slug: string; category: string }>(
  items: T[],
  segment: string | null,
  counts: Record<string, number>
): { ranked: T[]; topSlug: string | null } {
  const bySegment = reorderBySegment(items, segment);

  let top: T | null = null;
  for (const item of bySegment) {
    const count = counts[item.slug] ?? 0;
    if (count > 0 && (top === null || count > (counts[top.slug] ?? 0))) {
      top = item;
    }
  }

  if (!top) return { ranked: bySegment, topSlug: null };
  const topItem = top;
  return {
    ranked: [topItem, ...bySegment.filter((i) => i.slug !== topItem.slug)],
    topSlug: topItem.slug,
  };
}
