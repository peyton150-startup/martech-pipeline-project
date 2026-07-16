import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { destinations, getDestination } from "@/lib/destinations";
import AdaptiveBookingCta from "@/components/AdaptiveBookingCta";
import DestinationImage from "@/components/DestinationImage";
import DestinationViewTracker from "@/components/DestinationViewTracker";
import SaveButton from "@/components/SaveButton";

export function generateStaticParams() {
  return destinations.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const destination = getDestination(slug);
  if (!destination) {
    return { title: "Destination not found — Wayfarer Collection" };
  }
  const title = `${destination.name} — Wayfarer Collection`;
  const description = destination.blurb;
  return {
    title,
    description,
    alternates: { canonical: `/destinations/${destination.slug}` },
    openGraph: {
      title,
      description,
      type: "website",
      images: [{ url: destination.image, alt: destination.name }],
    },
    twitter: { card: "summary_large_image", title, description },
  };
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

      <div className="relative mt-6 h-72 w-full overflow-hidden rounded-2xl">
        {/* priority: this is the LCP element on destination pages. */}
        <DestinationImage
          src={destination.image}
          alt={destination.name}
          priority
          sizes="(max-width: 768px) 100vw, 768px"
          className="object-cover"
        />
        <SaveButton
          destination={destination}
          location="detail_page"
          className="absolute right-4 top-4 z-10 h-11 w-11 text-xl"
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
        {/* Behavior-aware: browsing_hesitant visitors get an assistance CTA. */}
        <AdaptiveBookingCta destinationSlug={destination.slug} />
      </div>
    </main>
  );
}
