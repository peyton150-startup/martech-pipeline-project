"use client";

import { useEffect, useRef, useState, createContext, useContext } from "react";
import { getConsentState, getSegment } from "@/lib/tracking/trackEvent";

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

      posthog.init(key!, {
        api_host: host!,
        // Bootstrap flag values so we skip the /decide round-trip.
        bootstrap: {
          featureFlags: bootstrappedFlags,
        },
        capture_pageview: false, // We fire our own page_viewed events.
        capture_pageleave: false,
        persistence: "localStorage+cookie",
        loaded: (ph) => {
          // Sync the segment as a person property for PostHog cohorts.
          const segment = getSegment();
          if (segment) {
            ph.setPersonProperties({ segment });
          }
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

  // Keep the segment person-property in sync on every navigation.
  useEffect(() => {
    if (!ph) return;
    const segment = getSegment();
    if (segment) {
      ph.setPersonProperties({ segment });
    }
  });

  return (
    <PostHogContext.Provider value={{ posthog: ph, flags }}>
      {children}
    </PostHogContext.Provider>
  );
}
