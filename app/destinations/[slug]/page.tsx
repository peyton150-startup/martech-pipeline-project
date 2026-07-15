import { notFound } from "next/navigation";
import Link from "next/link";
import { destinations, getDestination } from "@/lib/destinations";
import BookingCta from "@/components/BookingCta";
import DestinationViewTracker from "@/components/DestinationViewTracker";

export function generateStaticParams() {
  return destinations.map((d) => ({ slug: d.slug }));
}

export default async function DestinationPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const destination = getDestination(slug);
  if (!destination) notFound();

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      {/* One tracker implementation covers every destination page —
          this is the reusable-rule-template pattern. */}
      <DestinationViewTracker destination={destination} />

      <Link href="/" className="text-sm text-stone-500 hover:text-stone-800">
        &larr; All destinations
      </Link>

      <div className="mt-6 overflow-hidden rounded-2xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={destination.image}
          alt={destination.name}
          className="h-72 w-full object-cover"
        />
      </div>

      <div className="mt-8 flex items-start justify-between gap-6">
        <div>
          <p className="text-sm uppercase tracking-widest text-stone-500">
            {destination.region} · {destination.category}
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            {destination.name}
          </h1>
          <p className="mt-4 text-stone-600">{destination.blurb}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm text-stone-500">from</p>
          <p className="text-2xl font-semibold">${destination.priceFrom}</p>
          <p className="text-sm text-stone-500">per night</p>
        </div>
      </div>

      <div className="mt-10">
        <BookingCta
          ctaId="book_now_detail"
          location="detail_page"
          destinationSlug={destination.slug}
        />
      </div>
    </main>
  );
}
