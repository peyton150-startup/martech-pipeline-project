import { destinations } from "@/lib/destinations";
import DestinationCard from "@/components/DestinationCard";
import PageViewTracker from "@/components/PageViewTracker";
import PersonalizedSlot from "@/components/PersonalizedSlot";
import { reorderBySegment } from "@/lib/personalization/getDecision";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <PageViewTracker pageType="home" title="Wayfarer Collection — Home" />

      <PersonalizedSlot
        slotId="home-hero"
        className="mb-12"
        defaultContent={
          <header>
            <p className="text-sm uppercase tracking-widest text-stone-500">
              Wayfarer Collection
            </p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight">
              Where to next?
            </h1>
            <p className="mt-3 max-w-xl text-stone-600">
              Four properties, three kinds of trip. Pick the one that matches the
              week you need.
            </p>
          </header>
        }
        variants={{
          beach: (
            <header>
              <p className="text-sm uppercase tracking-widest text-stone-500">
                Wayfarer Collection
              </p>
              <h1 className="mt-2 text-4xl font-semibold tracking-tight">
                Sun, sand, and your perfect escape
              </h1>
              <p className="mt-3 max-w-xl text-stone-600">
                Hand-picked coastal retreats for your next getaway.
              </p>
            </header>
          ),
          ski: (
            <header>
              <p className="text-sm uppercase tracking-widest text-stone-500">
                Wayfarer Collection
              </p>
              <h1 className="mt-2 text-4xl font-semibold tracking-tight">
                Peaks, powder, and alpine luxury
              </h1>
              <p className="mt-3 max-w-xl text-stone-600">
                Mountain lodges where adventure meets comfort.
              </p>
            </header>
          ),
          city: (
            <header>
              <p className="text-sm uppercase tracking-widest text-stone-500">
                Wayfarer Collection
              </p>
              <h1 className="mt-2 text-4xl font-semibold tracking-tight">
                Culture, cuisine, and city lights
              </h1>
              <p className="mt-3 max-w-xl text-stone-600">
                Urban sanctuaries in the world's most vibrant cities.
              </p>
            </header>
          ),
        }}
      />

      <PersonalizedSlot
        slotId="home-cards"
        defaultContent={
          <section
            aria-label="Destinations"
            className="grid grid-cols-1 gap-6 sm:grid-cols-2"
          >
            {destinations.map((d) => (
              <DestinationCard key={d.slug} destination={d} />
            ))}
          </section>
        }
        variants={{
          beach: (
            <section
              aria-label="Destinations"
              className="grid grid-cols-1 gap-6 sm:grid-cols-2"
            >
              {reorderBySegment(destinations, "beach_intent").map((d) => (
                <DestinationCard key={d.slug} destination={d} />
              ))}
            </section>
          ),
          ski: (
            <section
              aria-label="Destinations"
              className="grid grid-cols-1 gap-6 sm:grid-cols-2"
            >
              {reorderBySegment(destinations, "ski_intent").map((d) => (
                <DestinationCard key={d.slug} destination={d} />
              ))}
            </section>
          ),
          city: (
            <section
              aria-label="Destinations"
              className="grid grid-cols-1 gap-6 sm:grid-cols-2"
            >
              {reorderBySegment(destinations, "city_intent").map((d) => (
                <DestinationCard key={d.slug} destination={d} />
              ))}
            </section>
          ),
        }}
      />
    </main>
  );
}
