"use client";

import { trackEvent } from "@/lib/tracking/trackEvent";
import type { CtaClickedEvent } from "@/lib/tracking/types";

export default function BookingCta({
  ctaId,
  location,
  destinationSlug,
  text = "Check availability",
}: {
  ctaId: string;
  location: CtaClickedEvent["cta"]["location"];
  destinationSlug?: string;
  text?: string;
}) {
  function handleClick() {
    trackEvent<CtaClickedEvent>({
      event: "cta_clicked",
      cta: {
        cta_id: ctaId,
        cta_text: text,
        location,
        ...(destinationSlug ? { destination_slug: destinationSlug } : {}),
      },
    });
    // Demo site: no real booking flow. In a real build this would navigate.
  }

  return (
    <button
      onClick={handleClick}
      data-testid={`cta-${ctaId}`}
      className="rounded-full bg-stone-900 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-stone-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-800"
    >
      {text}
    </button>
  );
}
