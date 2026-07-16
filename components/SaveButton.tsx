"use client";

import { useEffect, useState } from "react";
import { trackEvent } from "@/lib/tracking/trackEvent";
import type { DestinationSavedEvent } from "@/lib/tracking/types";
import type { Destination } from "@/lib/destinations";

/**
 * Wishlist "save" control. Emits a `destination_saved` event on save — a
 * stronger intent signal than a view, which feeds the engagement ranking
 * (a saved destination outranks a viewed one for the top-left slot) and marks
 * the visitor "converted" so they leave the browsing_hesitant segment.
 *
 * Saved slugs persist in localStorage so the heart reflects prior saves. On a
 * card the button is layered over the image as a sibling of the card's link
 * (never nested inside it) and stops propagation, so saving never navigates.
 */
const SAVED_KEY = "mtp_saved";

function readSaved(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(SAVED_KEY) || "[]") as string[];
  } catch {
    return [];
  }
}

export default function SaveButton({
  destination,
  location,
  className = "",
}: {
  destination: Pick<Destination, "slug" | "category" | "name">;
  location: "card" | "detail_page";
  className?: string;
}) {
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSaved(readSaved().includes(destination.slug));
  }, [destination.slug]);

  function toggle(e: React.MouseEvent) {
    // The card wraps its content in a <Link>; keep a save from navigating.
    e.preventDefault();
    e.stopPropagation();

    const current = readSaved();
    const isSaved = current.includes(destination.slug);
    const next = isSaved
      ? current.filter((s) => s !== destination.slug)
      : [...current, destination.slug];
    try {
      window.localStorage.setItem(SAVED_KEY, JSON.stringify(next));
    } catch {
      // localStorage unavailable — the heart still toggles for this render.
    }
    setSaved(!isSaved);

    // Only the save (not the un-save) is a meaningful intent signal.
    if (!isSaved) {
      trackEvent<DestinationSavedEvent>({
        event: "destination_saved",
        destination: {
          slug: destination.slug,
          category: destination.category,
          location,
        },
      });
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      data-testid={`save-${destination.slug}`}
      aria-pressed={saved}
      aria-label={
        saved ? `Remove ${destination.name} from saved` : `Save ${destination.name}`
      }
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-lg leading-none text-rose-500 shadow ring-1 ring-stone-200 backdrop-blur transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400 motion-reduce:transition-none ${className}`}
    >
      <span aria-hidden>{saved ? "♥" : "♡"}</span>
    </button>
  );
}
