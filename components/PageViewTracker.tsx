"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { trackEvent } from "@/lib/tracking/trackEvent";
import type { PageViewedEvent } from "@/lib/tracking/types";

export default function PageViewTracker({
  pageType,
  title,
}: {
  pageType: PageViewedEvent["page"]["page_type"];
  title: string;
}) {
  const pathname = usePathname();
  const fired = useRef<string | null>(null);

  useEffect(() => {
    if (fired.current === pathname) return; // guard against double-fire in dev StrictMode
    fired.current = pathname;
    trackEvent<PageViewedEvent>({
      event: "page_viewed",
      page: {
        path: pathname,
        title,
        page_type: pageType,
        referrer: document.referrer || undefined,
      },
    });
  }, [pathname, pageType, title]);

  return null;
}
