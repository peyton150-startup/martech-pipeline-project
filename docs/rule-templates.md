# Personalization Rule Templates

Reusable templates for building personalization rules in the Martech Pipeline. Each template defines a trigger, an action, implementation code, and usage guidance.

---

## Template 1: Category-Intent → Reorder

Reorder a list of items so that items matching the user's intent segment appear first.

### Trigger

User has a segment matching the pattern `{category}_intent` in `localStorage` (key: `mtp_segment`).

**Examples:** `beach_intent`, `ski_intent`, `city_intent`

### Action

Reorder an array of items so that items whose `category` matches the segment's category appear first. All items remain visible — nothing is hidden or removed.

### Example

| Segment | Before | After |
|---|---|---|
| `beach_intent` | `[ski, city, beach, beach]` | `[beach, beach, ski, city]` |
| `city_intent` | `[ski, city, beach, beach]` | `[city, ski, beach, beach]` |
| `null` (no segment) | `[ski, city, beach, beach]` | `[ski, city, beach, beach]` (unchanged) |

### Implementation

```ts
/**
 * Reorder items by segment affinity.
 * Matching-category items float to the top; non-matching items
 * preserve their original relative order (stable sort).
 */
function reorderBySegment<T extends { category: string }>(
  items: T[],
  segment: string | null,
): T[] {
  if (!segment) return items;
  const category = segment.replace('_intent', '');
  return [
    ...items.filter(i => i.category === category),
    ...items.filter(i => i.category !== category),
  ];
}
```

### Usage Example

```tsx
import { getDecision } from '@/lib/tracking/getDecision';

function DestinationGrid({ destinations }: { destinations: Destination[] }) {
  const segment = getDecision(); // sync read from localStorage
  const ordered = reorderBySegment(destinations, segment);

  return (
    <div className="grid grid-cols-2 gap-4">
      {ordered.map(d => (
        <DestinationCard key={d.id} destination={d} />
      ))}
    </div>
  );
}
```

### When To Use

- Product grids
- Search results
- Recommendation carousels
- Category listing pages

### Considerations

> [!IMPORTANT]
> **Preserve item visibility.** Never hide items — only reorder them. Users should always be able to find all content; personalization just changes the default sort order.

- **Maintain stable React keys.** Use item IDs, not array indices, as `key` props. Reordering with index-based keys causes unnecessary re-mounts and breaks animations.
- **Keep the original order deterministic.** Non-matching items should preserve their original relative order (the `filter` approach above guarantees this).
- **Consider pagination.** If the list is paginated, reordering only affects items within the current page. For cross-page reordering, apply the sort server-side.

---

## Template 2: Category-Intent → Hero Variant

Swap hero section copy and imagery based on the user's intent segment.

### Trigger

User has a segment matching the pattern `{category}_intent` in `localStorage` (key: `mtp_segment`).

**Examples:** `beach_intent`, `ski_intent`, `city_intent`

### Action

Select a hero variant (headline + subline) from a variant map keyed by category. If no segment is present, use the `default` variant.

### Example

| Segment | Headline | Subline |
|---|---|---|
| `beach_intent` | Sun, sand, and your perfect escape | Hand-picked coastal retreats for your next getaway |
| `ski_intent` | Peaks, powder, and alpine luxury | Mountain lodges where adventure meets comfort |
| `city_intent` | Culture, cuisine, and city lights | Urban sanctuaries in the world's most vibrant cities |
| `null` (default) | Where to next? | Four properties, three kinds of trip |

### Implementation

```ts
/**
 * Hero variant map.
 * Each key maps a category to hero copy. The 'default' key is the fallback
 * shown when no segment is present or the segment doesn't match any variant.
 */
const HERO_VARIANTS: Record<string, { headline: string; subline: string }> = {
  beach: {
    headline: 'Sun, sand, and your perfect escape',
    subline: 'Hand-picked coastal retreats for your next getaway',
  },
  ski: {
    headline: 'Peaks, powder, and alpine luxury',
    subline: 'Mountain lodges where adventure meets comfort',
  },
  city: {
    headline: 'Culture, cuisine, and city lights',
    subline: 'Urban sanctuaries in the world\'s most vibrant cities',
  },
  default: {
    headline: 'Where to next?',
    subline: 'Four properties, three kinds of trip',
  },
};

/**
 * Resolve the hero variant for a given segment.
 */
function getHeroVariant(segment: string | null): { headline: string; subline: string } {
  if (!segment) return HERO_VARIANTS.default;
  const category = segment.replace('_intent', '');
  return HERO_VARIANTS[category] ?? HERO_VARIANTS.default;
}
```

### Usage Example

```tsx
import { getDecision } from '@/lib/tracking/getDecision';

function HeroSection() {
  const segment = getDecision(); // sync read from localStorage
  const { headline, subline } = getHeroVariant(segment);

  return (
    <PersonalizedSlot width={1200} height={400}>
      <section className="hero">
        <h1>{headline}</h1>
        <p>{subline}</p>
      </section>
    </PersonalizedSlot>
  );
}
```

### When To Use

- Landing page heroes
- Email headers (with server-side variant resolution)
- Ad creatives and dynamic banners
- Campaign-specific landing pages

### Considerations

> [!IMPORTANT]
> **Always include a `default` variant.** Every variant map must have a fallback. New visitors, cleared storage, and unrecognized segments must all resolve to a coherent default experience.

- **Keep copy consistent with brand voice.** Personalized variants should feel like natural alternatives, not jarring departures from the brand tone.
- **Test all variants visually.** Different headline lengths can break layouts. Verify that every variant fits within the hero's reserved dimensions.
- **Wrap in `<PersonalizedSlot>`.** Always use the anti-flicker gate to prevent CLS if the decision is delayed.

---

## Adding a New Personalization Rule

Follow these steps to add a new rule to the pipeline:

### Step 1: Define the Trigger Segment(s)

Identify which segment(s) should activate the rule. Segments follow the `{category}_intent` naming convention.

```ts
// Example: adding a "luxury_intent" segment
// This would be stamped when a user views a luxury-tagged destination
```

> [!NOTE]
> If your rule requires a new segment that doesn't exist yet, you'll also need to update `stampSegment()` in the tracking layer to write the new segment on the appropriate user action.

### Step 2: Define the Variant Map

Create a mapping from segment → content. Always include a `default` entry.

```ts
const MY_VARIANTS: Record<string, MyVariantType> = {
  luxury: { /* luxury-specific content */ },
  budget: { /* budget-specific content */ },
  default: { /* fallback content */ },
};
```

### Step 3: Add the Mapping to `getDecision()` or Bootstrapped Flags

**For local-first (client-side):**

Update `getDecision()` to recognize and return the new segment for your rule's context.

**For bootstrapped flags (server-side):**

Add the new flag evaluation logic to the edge middleware so the flag is resolved server-side and injected into the response.

### Step 4: Create a `<PersonalizedSlot>` With the Variants

Wrap the personalizable region in a `<PersonalizedSlot>` component:

```tsx
<PersonalizedSlot width={600} height={200}>
  <MyPersonalizedComponent variant={resolvedVariant} />
</PersonalizedSlot>
```

> [!TIP]
> Always specify explicit `width` and `height` on the slot to pre-reserve layout space and prevent CLS.

### Step 5: Add a Playwright Test

Create a Playwright test that verifies:

1. The correct variant renders for each segment
2. The `personalization_decided` event fires with the correct `strategy` and `segment`
3. `decided_before_paint` is `true`
4. The default variant renders when no segment is present

```ts
test('new rule: luxury segment shows luxury variant', async ({ page }) => {
  // Set the segment before navigating
  await page.evaluate(() => {
    localStorage.setItem('mtp_segment', 'luxury_intent');
  });

  await page.goto('/');

  // Verify the correct variant rendered
  await expect(page.getByText('Expected luxury headline')).toBeVisible();

  // Verify the tracking event
  const events = await page.evaluate(() => window.dataLayer);
  const decided = events.find(e => e.event === 'personalization_decided');
  expect(decided.decided_before_paint).toBe(true);
  expect(decided.segment).toBe('luxury_intent');
});
```

### Checklist

- [ ] Trigger segment(s) identified and `stampSegment()` updated if needed
- [ ] Variant map created with a `default` entry
- [ ] `getDecision()` or middleware updated to handle the new segment
- [ ] UI wrapped in `<PersonalizedSlot>` with explicit dimensions
- [ ] Playwright test added and passing
- [ ] `decided_before_paint: true` verified in test
- [ ] All variants visually reviewed (no layout overflow or copy truncation)
