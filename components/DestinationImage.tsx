"use client";

import Image from "next/image";
import { useState } from "react";

/**
 * next/image with a graceful fallback. If the remote image fails to load
 * (e.g. the host is blocked, rate-limited, or the URL rotted), it degrades to
 * a neutral gradient block of the same size instead of a broken-image icon —
 * so the layout box is always filled and CLS stays 0 either way.
 */
export default function DestinationImage({
  src,
  alt,
  sizes,
  priority = false,
  className = "",
}: {
  src: string;
  alt: string;
  sizes: string;
  priority?: boolean;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        aria-hidden
        className={`h-full w-full bg-gradient-to-br from-stone-200 via-stone-100 to-stone-300 ${className}`}
      />
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
