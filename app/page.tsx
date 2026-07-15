import { destinations } from "@/lib/destinations";
import PageViewTracker from "@/components/PageViewTracker";
import PersonalizedSlot from "@/components/PersonalizedSlot";
import PersonalizedDestinationGrid from "@/components/PersonalizedDestinationGrid";

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
                Urban sanctuaries in the world&apos;s most vibrant cities.
              </p>
            </header>
          ),
        }}
      />

      {/* Cards compose two signals (segment + engagement counts), so the
          ordering is computed rather than picked from a static variant map —
          the grid does its own pre-paint decision instead of PersonalizedSlot. */}
      <PersonalizedDestinationGrid destinations={destinations} />
    </main>
  );
}
