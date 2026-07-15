"use client";

import { useEffect, useRef } from "react";
import { trackEvent } from "@/lib/tracking/trackEvent";
import type {
  DestinationViewedEvent,
  PageViewedEvent,
} from "@/lib/tracking/types";
import type { Destination } from "@/lib/destinations";

/**
 * Fires page_viewed + destination_viewed on mount. destination_viewed also
 * stamps the segment cookie/localStorage synchronously inside trackEvent —
 * that stamp is what makes next-page personalization race-free on day 4.
 *
 * Day-4 experiment: move this firing even earlier (inline script / layout
 * effect) and measure the gap between stamp time and first paint.
 */
export default function DestinationViewTracker({
  destination,
}: {
  destination: Destination;
}) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    trackEvent<PageViewedEvent>({
      event: "page_viewed",
      page: {
        path: `/destinations/${destination.slug}`,
        title: `Wayfarer Collection — ${destination.name}`,
        page_type: "destination",
        referrer: document.referrer || undefined,
      },
    });

    trackEvent<DestinationViewedEvent>({
      event: "destination_viewed",
      destination: {
        slug: destination.slug,
        category: destination.category,
        region: destination.region,
        price_from: destination.priceFrom,
      },
    });
  }, [destination]);

  return null;
}
