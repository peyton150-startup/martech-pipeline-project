"use client";

import { useEffect, useRef, useState, createContext, useContext } from "react";
import { usePathname } from "next/navigation";
import { getConsentState, getSegment } from "@/lib/tracking/trackEvent";
import { getBehaviorSegment } from "@/lib/personalization/behavior";

// ---------------------------------------------------------------------------
// PostHog context — lets child components access posthog + flag values
// ---------------------------------------------------------------------------

interface PostHogContextValue {
  /** null until posthog-js has loaded and been initialized. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  posthog: any | null;
  /** Bootstrapped feature flag values (available synchronously). */
  flags: Record<string, string | boolean>;
}

const PostHogContext = createContext<PostHogContextValue>({
  posthog: null,
  flags: {},
});

export function usePostHog() {
  return useContext(PostHogContext);
}

/**
 * Strategy 2 (bootstrapped flags), client half: the edge middleware evaluated
 * the flag server-side and set the `mtp_bootstrapped_flags` cookie
 * (httpOnly:false so JS can read it). Reading it here means posthog-js
 * initializes with flag answers already in hand — no `/decide` round-trip and
 * no flicker — while keeping the pages statically rendered (no `cookies()` in
 * the layout, which would force dynamic rendering).
 */
function readBootstrappedFlagsCookie(): Record<string, string | boolean> {
  if (typeof document === "undefined") return {};
  const match = document.cookie.match(
    /(?:^|;\s*)mtp_bootstrapped_flags=([^;]+)/
  );
  if (!match) return {};
  try {
    return JSON.parse(decodeURIComponent(match[1])) as Record<
      string,
      string | boolean
    >;
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

/**
 * Wraps the app and manages posthog-js lifecycle.
 *
 * - **Consent-gated**: does NOT initialise until `getConsentState() === "granted"`.
 * - **Bootstrapped flags**: accepts pre-evaluated flag values from edge
 *   middleware so the client SDK has answers at init — no `/decide` wait.
 * - **Segment sync**: pushes `getSegment()` as a person property on each
 *   page so PostHog can build cohorts (beach_intent, ski_intent, …).
 *
 * Events reach PostHog via the GTM tag (vendor-neutral), NOT via direct
 * `posthog.capture()` in this provider. The provider handles identity,
 * segment properties, and feature-flag bootstrap only.
 */
export default function PostHogProvider({
  children,
  bootstrappedFlags = {},
}: {
  children: React.ReactNode;
  bootstrappedFlags?: Record<string, string | boolean>;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [ph, setPh] = useState<any | null>(null);
  const [flags, setFlags] = useState<Record<string, string | boolean>>(bootstrappedFlags);
  const initAttempted = useRef(false);
  const pathname = usePathname();

  useEffect(() => {
    if (initAttempted.current) return;

    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

    // If env vars are missing, run without PostHog (graceful degradation).
    if (!key || !host) return;

    async function tryInit() {
      // Only initialise when consent has been granted.
      if (getConsentState() !== "granted") {
        // Re-check periodically — the user might grant consent at any time.
        const interval = setInterval(() => {
          if (getConsentState() === "granted") {
            clearInterval(interval);
            tryInit();
          }
        }, 500);
        return;
      }

      initAttempted.current = true;

      // Dynamic import keeps posthog-js out of the initial bundle when
      // consent hasn't been granted yet.
      const posthog = (await import("posthog-js")).default;

      // Merge the server-evaluated flags from the middleware cookie over any
      // passed as a prop, so the SDK has answers at init.
      const bootstrapFlags = {
        ...bootstrappedFlags,
        ...readBootstrappedFlagsCookie(),
      };
      if (Object.keys(bootstrapFlags).length > 0) {
        setFlags((prev) => ({ ...prev, ...bootstrapFlags }));
      }

      posthog.init(key!, {
        api_host: "/ingest",
        ui_host: "https://us.posthog.com",
        defaults: "2026-01-30",
        capture_exceptions: true,
        debug: process.env.NODE_ENV === "development",
        // Bootstrap flag values so we skip the /decide round-trip.
        bootstrap: {
          featureFlags: bootstrapFlags,
        },
        capture_pageview: false, // We fire our own page_viewed events.
        capture_pageleave: false,
        persistence: "localStorage+cookie",
        loaded: (ph) => {
          // Sync both segmentation dimensions as person properties so PostHog
          // can build cohorts on intent (beach_intent, …) and on behavior
          // (browsing_hesitant / engaged).
          const segment = getSegment();
          if (segment) {
            ph.setPersonProperties({ segment });
          }
          const behavior = getBehaviorSegment();
          if (behavior) {
            ph.setPersonProperties({ behavior_segment: behavior });
          }
          ph.capture("consent_granted");
        },
      });

      posthog.onFeatureFlags((loadedFlags: string[]) => {
        const currentFlags: Record<string, string | boolean> = {};
        for (const f of loadedFlags) {
          const val = posthog.getFeatureFlag(f);
          if (val !== undefined) currentFlags[f] = val;
        }
        setFlags((prev) => ({ ...prev, ...currentFlags }));
      });
      setPh(posthog);
    }

    tryInit();
  }, [bootstrappedFlags]);

  // Keep the segmentation person-properties in sync on navigation — keyed on
  // pathname so this runs once per page, not on every render.
  useEffect(() => {
    if (!ph) return;
    const segment = getSegment();
    if (segment) {
      ph.setPersonProperties({ segment });
    }
    const behavior = getBehaviorSegment();
    if (behavior) {
      ph.setPersonProperties({ behavior_segment: behavior });
    }
  }, [ph, pathname]);

  return (
    <PostHogContext.Provider value={{ posthog: ph, flags }}>
      {children}
    </PostHogContext.Provider>
  );
}
