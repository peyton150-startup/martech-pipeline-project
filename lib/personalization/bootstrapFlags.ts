/**
 * Bootstrapped flag evaluation.
 *
 * Maps a segment string to feature-flag values that PostHog would return.
 * For the demo, this uses a static rules map; in production, swap in the
 * PostHog Node SDK for server-side flag evaluation:
 *
 *   import { PostHog } from 'posthog-node';
 *   const ph = new PostHog(process.env.POSTHOG_API_KEY!);
 *   const flags = await ph.getAllFlags('user-id');
 *
 * The result is passed to posthog-js via the `bootstrap.featureFlags` option
 * so the client SDK has flag values at init — no /decide round-trip.
 */

/** Segment → personalized-hero variant. */
const FLAG_RULES: Record<string, string> = {
  beach_intent: "beach",
  ski_intent: "ski",
  city_intent: "city",
};

export interface BootstrappedFlags {
  "personalized-hero": string;
}

/**
 * Evaluate feature flags given a segment. Returns a map of flag-name → value
 * suitable for `posthog.init({ bootstrap: { featureFlags } })`.
 */
export function evaluateFlags(
  segment: string | null
): BootstrappedFlags {
  return {
    "personalized-hero":
      segment && FLAG_RULES[segment] ? FLAG_RULES[segment] : "default",
  };
}

/**
 * Parse the segment cookie value. The cookie stores the same JSON as
 * localStorage key `mtp_segment`. Returns the segment string or null.
 */
export function parseSegmentCookie(cookieValue: string | undefined): string | null {
  if (!cookieValue) return null;
  try {
    const decoded = decodeURIComponent(cookieValue);
    const parsed = JSON.parse(decoded) as { segment: string };
    return parsed.segment || null;
  } catch {
    return null;
  }
}
