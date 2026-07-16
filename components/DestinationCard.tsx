import Link from "next/link";
import DestinationImage from "./DestinationImage";
import SaveButton from "./SaveButton";
import type { Destination } from "@/lib/destinations";

export default function DestinationCard({
  destination,
  priority = false,
}: {
  destination: Destination;
  /** Set on the first card (the LCP element) so its image loads eagerly. */
  priority?: boolean;
}) {
  return (
    <article className="group relative overflow-hidden rounded-2xl border border-stone-200 bg-white transition-shadow hover:shadow-md">
      <Link
        href={`/destinations/${destination.slug}`}
        className="block focus-visible:outline focus-visible:outline-2 focus-visible:outline-stone-800"
      >
        {/* Fixed-height wrapper reserves the layout box before the image
            loads — the grid can never shift (CLS 0). */}
        <div className="relative h-48 w-full overflow-hidden">
          <DestinationImage
            src={destination.image}
            alt={destination.name}
            priority={priority}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 480px"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        </div>
        <div className="p-5">
          <p className="text-xs uppercase tracking-widest text-stone-500">
            {destination.region} · {destination.category}
          </p>
          <h2 className="mt-1 text-lg font-semibold">{destination.name}</h2>
          <p className="mt-2 line-clamp-2 text-sm text-stone-600">
            {destination.blurb}
          </p>
          <p className="mt-3 text-sm font-medium">
            from ${destination.priceFrom}/night
          </p>
        </div>
      </Link>
      {/* Sibling of the link (not nested) so a save never triggers navigation. */}
      <SaveButton
        destination={destination}
        location="card"
        className="absolute right-3 top-3 z-10"
      />
    </article>
  );
}
