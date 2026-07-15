export type DestinationCategory = "beach" | "ski" | "city";

export interface Destination {
  slug: string;
  name: string;
  category: DestinationCategory;
  region: string;
  blurb: string;
  image: string; // remote Unsplash URL or /public path
  priceFrom: number;
}

export const destinations: Destination[] = [
  {
    slug: "maui-shores",
    name: "Maui Shores",
    category: "beach",
    region: "Hawaii, USA",
    blurb:
      "Black-sand coves, warm trade winds, and reef snorkeling steps from your room.",
    image:
      "https://images.unsplash.com/photo-1505852679233-d9fd70aff56d?w=1200&q=80",
    priceFrom: 289,
  },
  {
    slug: "aspen-highlands",
    name: "Aspen Highlands",
    category: "ski",
    region: "Colorado, USA",
    blurb:
      "Steep bowls, quiet glades, and a slope-side lodge with a working fireplace.",
    image:
      "https://images.unsplash.com/photo-1551524559-8af4e6624178?w=1200&q=80",
    priceFrom: 342,
  },
  {
    slug: "kyoto-quarter",
    name: "Kyoto Quarter",
    category: "city",
    region: "Kansai, Japan",
    blurb:
      "Temple lanes at dawn, market alleys at night, and a garden view from every floor.",
    image:
      "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=1200&q=80",
    priceFrom: 214,
  },
  {
    slug: "amalfi-terraces",
    name: "Amalfi Terraces",
    category: "beach",
    region: "Campania, Italy",
    blurb:
      "Cliffside lemon groves and a private stair down to a pebbled swimming cove.",
    image:
      "https://images.unsplash.com/photo-1533606688076-b6683a5f59f1?w=1200&q=80",
    priceFrom: 356,
  },
];

export function getDestination(slug: string): Destination | undefined {
  return destinations.find((d) => d.slug === slug);
}
