import { test, expect } from "@playwright/test";

test("exact-once delivery", async ({ page }) => {
  await page.goto("/destinations/maui-shores");

  // Read the dataLayer
  const dataLayer = await page.evaluate(() => window.dataLayer);
  expect(dataLayer).toBeDefined();

  // Extract all event_ids from our custom events
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eventIds = dataLayer
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((e: any) => e.event_id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((e: any) => e.event_id);

  // Assert there are no duplicates
  const uniqueEventIds = new Set(eventIds);
  expect(eventIds.length).toBe(uniqueEventIds.size);
});
