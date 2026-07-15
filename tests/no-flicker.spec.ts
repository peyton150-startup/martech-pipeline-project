import { test, expect } from "@playwright/test";
import type { PersonalizationDecidedEvent } from "../lib/tracking/types";

test("no-flicker: personalized slot content at first paint", async ({
  page,
}) => {
  // Setup: fake a returning user with beach intent
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "mtp_segment",
      JSON.stringify({ segment: "beach_intent", source_event_id: "test", updated_at: new Date().toISOString() })
    );
  });

  // Navigate to home page
  await page.goto("/");

  // Verify the hero text matches the beach variant, and we can check it immediately
  const heroHeading = await page.locator("data-testid=personalized-slot-home-hero >> h1");
  await expect(heroHeading).toHaveText("Sun, sand, and your perfect escape");

  // Verify the personalization_decided event was emitted with decided_before_paint: true.
  // The assertion is typed with the schema-generated contract, so a schema
  // change that renames these fields fails here at compile time too.
  const dataLayer = await page.evaluate(() => window.dataLayer);
  const decEvent = dataLayer.find(
    (e) => (e as { event?: string }).event === "personalization_decided"
  ) as unknown as PersonalizationDecidedEvent | undefined;

  expect(decEvent).toBeDefined();
  expect(decEvent!.personalization.decided_before_paint).toBe(true);
  expect(decEvent!.personalization.variant).toBe("beach");
  expect(decEvent!.personalization.strategy).toBe("local-first");
});
