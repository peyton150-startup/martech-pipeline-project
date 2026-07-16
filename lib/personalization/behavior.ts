"use client";

/**
 * Behavioral segmentation — the second personalization dimension.
 *
 * The primary segment (`{category}_intent`) captures *what* a visitor is
 * interested in. This captures *how* they're behaving: a visitor who has
 * viewed several destinations this session without saving one or clicking a
 * booking CTA is "browsing_hesitant" — high consideration, low commitment —
 * and gets a softer, assistance-oriented CTA instead of the hard book button.
 *
 * Session-scoped on purpose (sessionStorage, not localStorage): hesitancy is
 * a property of the current visit, not a durable trait. Composes with the
 * intent segment rather than replacing it — real personalization engines
 * combine signals, they don't pick one.
 */

const SESSION_VIEWS_KEY = "mtp_session_dest_views";
const SESSION_CONVERTED_KEY = "mtp_session_converted";

/** Views of distinct-or-repeat destinations before a visitor "hesitant". */
export const HESITANT_THRESHOLD = 3;

export type BehaviorSegment = "browsing_hesitant" | "engaged";

function readInt(key: string): number {
  try {
    return Number(window.sessionStorage.getItem(key)) || 0;
  } catch {
    return 0;
  }
}

/**
 * Called by trackEvent for every validated event. Increments the session
 * destination-view counter and flips the "converted" flag on any commitment
 * signal (CTA click or save).
 */
export function recordBehaviorSignal(evt: {
  event: string;
}): void {
  if (typeof window === "undefined") return;
  try {
    if (evt.event === "destination_viewed") {
      window.sessionStorage.setItem(
        SESSION_VIEWS_KEY,
        String(readInt(SESSION_VIEWS_KEY) + 1)
      );
    } else if (evt.event === "cta_clicked" || evt.event === "destination_saved") {
      window.sessionStorage.setItem(SESSION_CONVERTED_KEY, "1");
    }
  } catch {
    // sessionStorage unavailable — behavior segment simply stays null.
  }
}

/**
 * Synchronous read (safe inside useLayoutEffect). Returns the behavioral
 * segment, or null when there isn't enough signal yet. `browsing_hesitant`
 * requires HESITANT_THRESHOLD+ views this session with no conversion.
 */
export function getBehaviorSegment(): BehaviorSegment | null {
  if (typeof window === "undefined") return null;
  const converted = (() => {
    try {
      return window.sessionStorage.getItem(SESSION_CONVERTED_KEY) === "1";
    } catch {
      return false;
    }
  })();
  if (converted) return "engaged";
  return readInt(SESSION_VIEWS_KEY) >= HESITANT_THRESHOLD
    ? "browsing_hesitant"
    : null;
}
